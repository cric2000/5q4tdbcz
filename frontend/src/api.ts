export interface Health {
  status: 'ok';
  service: 'windsight';
  phase: 'ingestion';
  data_status: 'not_ingested' | 'snapshot_ready' | 'snapshot_incomplete' | 'snapshot_invalid';
}

export interface PilotConfig {
  decision_cutoff_gmt: string;
  cutoff_reference_url: string;
  cutoff_is_assumed: boolean;
  decision_date_from: string;
  decision_date_to: string;
  delivery_date_from: string;
  delivery_date_to: string;
}

export interface SetupStatus { health: Health; config: PilotConfig }

export class ApiError extends Error {
  constructor(message: string, public code = 'request_failed') { super(message); }
}

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
      throw new ApiError(body.error.message, typeof body.error.code === 'string' ? body.error.code : 'request_failed');
    }
    throw new ApiError(`The service returned HTTP ${response.status}. Please try again.`);
  }
  return response.json();
}

export interface AnalysisReference { snapshot_id: string; decision_cutoff_gmt: string }
export interface Metadata extends PilotConfig {
  timezone: 'UTC';
  power_unit: 'MW';
  comparison_resolution_minutes: 60;
  actuals_are_retrospective: true;
  actual_aggregation: string;
  error_definition: string;
  percentile_method: string;
  sources: { dataset: string; documentation_url: string; native_resolution: string; unit: 'MW' }[];
  snapshot: { content_sha256: string; retrieved_at: string; forecast_records: number; outturn_half_hours: number };
  limitations: string[];
}
export interface Coverage {
  expected_hours: number;
  matched_hours: number;
  coverage_percent: number | null;
  missing_forecast_hours: number;
  no_eligible_forecast_hours: number;
  incomplete_actual_hours: number;
}
export interface Metrics {
  coverage: Coverage;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  p50_absolute_error_mw: number | null;
  p90_absolute_error_mw: number | null;
  max_absolute_error_mw: number | null;
  overforecast_hours: number;
  underforecast_hours: number;
  exact_hours: number;
  overforecast_percent: number | null;
  underforecast_percent: number | null;
  exact_percent: number | null;
}
export type MissingReason = 'missing_forecast' | 'no_eligible_forecast' | 'missing_actual_first_half' | 'missing_actual_second_half';
export interface HourlyComparison {
  target_time: string;
  forecast_mw: number | null;
  forecast_published_at: string | null;
  forecast_age_hours_at_cutoff: number | null;
  actual_half_hours_mw: [number | null, number | null];
  actual_mw: number | null;
  error_mw: number | null;
  absolute_error_mw: number | null;
  status: 'matched' | 'missing_data';
  missing_reasons: MissingReason[];
}
export interface Decision {
  meta: AnalysisReference;
  decision_date: string;
  delivery_date: string;
  cutoff: string;
  hours: HourlyComparison[];
  metrics: Metrics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || finite(value);
const dateString = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value));
const cutoffString = (value: unknown) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const snapshotId = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const httpsUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

export async function loadMetadata(_key: string, signal: AbortSignal): Promise<Metadata> {
  const value = await getJson('/api/v1/metadata', signal);
  if (!isRecord(value) || !['decision_date_from', 'decision_date_to', 'delivery_date_from', 'delivery_date_to'].every((key) => dateString(value[key]))
    || !cutoffString(value.decision_cutoff_gmt) || value.cutoff_is_assumed !== true || !httpsUrl(value.cutoff_reference_url)
    || value.timezone !== 'UTC' || value.power_unit !== 'MW' || value.comparison_resolution_minutes !== 60 || value.actuals_are_retrospective !== true
    || !['actual_aggregation', 'error_definition', 'percentile_method'].every((key) => typeof value[key] === 'string')
    || !Array.isArray(value.sources) || value.sources.length === 0 || !value.sources.every((source) => isRecord(source) && typeof source.dataset === 'string' && httpsUrl(source.documentation_url) && typeof source.native_resolution === 'string' && source.unit === 'MW')
    || !isRecord(value.snapshot) || !snapshotId(value.snapshot.content_sha256) || !timestamp(value.snapshot.retrieved_at)
    || !finite(value.snapshot.forecast_records) || !finite(value.snapshot.outturn_half_hours)
    || !Array.isArray(value.limitations) || !value.limitations.every((item) => typeof item === 'string')) {
    throw new ApiError('The service returned unexpected metadata. Please refresh and try again.', 'invalid_response');
  }
  return value as unknown as Metadata;
}

const missingReasons: MissingReason[] = ['missing_forecast', 'no_eligible_forecast', 'missing_actual_first_half', 'missing_actual_second_half'];
function validHour(value: unknown): boolean {
  return isRecord(value) && timestamp(value.target_time)
    && ['forecast_mw', 'forecast_age_hours_at_cutoff', 'actual_mw', 'error_mw', 'absolute_error_mw'].every((key) => nullableNumber(value[key]))
    && (value.forecast_published_at === null || timestamp(value.forecast_published_at))
    && Array.isArray(value.actual_half_hours_mw) && value.actual_half_hours_mw.length === 2 && value.actual_half_hours_mw.every(nullableNumber)
    && ['matched', 'missing_data'].includes(String(value.status))
    && Array.isArray(value.missing_reasons) && value.missing_reasons.every((reason) => missingReasons.includes(reason));
}
function validMetrics(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.coverage)) return false;
  const coverage = value.coverage;
  return ['expected_hours', 'matched_hours', 'missing_forecast_hours', 'no_eligible_forecast_hours', 'incomplete_actual_hours'].every((key) => Number.isInteger(coverage[key]) && Number(coverage[key]) >= 0)
    && nullableNumber(coverage.coverage_percent)
    && ['mae_mw', 'rmse_mw', 'bias_mw', 'p50_absolute_error_mw', 'p90_absolute_error_mw', 'max_absolute_error_mw', 'overforecast_percent', 'underforecast_percent', 'exact_percent'].every((key) => nullableNumber(value[key]))
    && ['overforecast_hours', 'underforecast_hours', 'exact_hours'].every((key) => Number.isInteger(value[key]) && Number(value[key]) >= 0);
}

export async function loadDecision(date: string, signal: AbortSignal): Promise<Decision> {
  const value = await getJson(`/api/v1/decisions/${encodeURIComponent(date)}`, signal);
  const delivery = new Date(`${date}T00:00:00Z`);
  delivery.setUTCDate(delivery.getUTCDate() + 1);
  const expectedDelivery = delivery.toISOString().slice(0, 10);
  if (!isRecord(value) || !isRecord(value.meta) || !snapshotId(value.meta.snapshot_id) || !cutoffString(value.meta.decision_cutoff_gmt)
    || value.decision_date !== date || value.delivery_date !== expectedDelivery
    || value.cutoff !== `${date}T${value.meta.decision_cutoff_gmt}:00Z`
    || !Array.isArray(value.hours) || value.hours.length !== 24 || !value.hours.every(validHour)
    || !value.hours.every((hour: HourlyComparison, index: number) => Date.parse(hour.target_time) === delivery.getTime() + index * 3600000)
    || !validMetrics(value.metrics)) {
    throw new ApiError('The service returned unexpected replay data. Please try again.', 'invalid_response');
  }
  return value as unknown as Decision;
}

export async function loadSetup(signal: AbortSignal): Promise<SetupStatus> {
  const [health, config] = await Promise.all([
    getJson('/api/v1/health', signal),
    getJson('/api/v1/config', signal),
  ]);
  if (!health || typeof health !== 'object'
    || !('status' in health) || health.status !== 'ok'
    || !('service' in health) || health.service !== 'windsight'
    || !('phase' in health) || health.phase !== 'ingestion'
    || !('data_status' in health)
    || typeof health.data_status !== 'string'
    || !['not_ingested', 'snapshot_ready', 'snapshot_incomplete', 'snapshot_invalid'].includes(health.data_status)
    || !config || typeof config !== 'object'
    || !('decision_cutoff_gmt' in config) || typeof config.decision_cutoff_gmt !== 'string'
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(config.decision_cutoff_gmt)
    || !('cutoff_reference_url' in config) || typeof config.cutoff_reference_url !== 'string'
    || !config.cutoff_reference_url.startsWith('https://')
    || !('cutoff_is_assumed' in config) || config.cutoff_is_assumed !== true
    || !('decision_date_from' in config) || typeof config.decision_date_from !== 'string'
    || !('decision_date_to' in config) || typeof config.decision_date_to !== 'string'
    || !('delivery_date_from' in config) || typeof config.delivery_date_from !== 'string'
    || !('delivery_date_to' in config) || typeof config.delivery_date_to !== 'string') {
    throw new Error('Unexpected setup response');
  }
  return { health: health as Health, config: config as PilotConfig };
}

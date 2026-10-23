import { ApiError } from '@/api/client';
import type { AnalysisReference, Metadata, Metrics, MissingReason } from '@/api/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const nullableNumber = (value: unknown) => value === null || finite(value);

export const dateString = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value));

export const cutoffString = (value: unknown) =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export const snapshotId = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export const httpsUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const missingReasons: MissingReason[] = [
  'missing_forecast',
  'no_eligible_forecast',
  'missing_actual_first_half',
  'missing_actual_second_half',
];

export function validHour(value: unknown): boolean {
  return (
    isRecord(value) &&
    timestamp(value.target_time) &&
    [
      'forecast_mw',
      'forecast_age_hours_at_cutoff',
      'actual_mw',
      'error_mw',
      'absolute_error_mw',
    ].every((key) => nullableNumber(value[key])) &&
    (value.forecast_published_at === null || timestamp(value.forecast_published_at)) &&
    Array.isArray(value.actual_half_hours_mw) &&
    value.actual_half_hours_mw.length === 2 &&
    value.actual_half_hours_mw.every(nullableNumber) &&
    ['matched', 'missing_data'].includes(String(value.status)) &&
    Array.isArray(value.missing_reasons) &&
    value.missing_reasons.every((reason) => missingReasons.includes(reason))
  );
}

export function validMetrics(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.coverage)) return false;
  const coverage = value.coverage;
  return (
    [
      'expected_hours',
      'matched_hours',
      'missing_forecast_hours',
      'no_eligible_forecast_hours',
      'incomplete_actual_hours',
    ].every((key) => Number.isInteger(coverage[key]) && Number(coverage[key]) >= 0) &&
    nullableNumber(coverage.coverage_percent) &&
    [
      'mae_mw',
      'rmse_mw',
      'bias_mw',
      'p50_absolute_error_mw',
      'p90_absolute_error_mw',
      'max_absolute_error_mw',
      'overforecast_percent',
      'underforecast_percent',
      'exact_percent',
    ].every((key) => nullableNumber(value[key])) &&
    ['overforecast_hours', 'underforecast_hours', 'exact_hours'].every(
      (key) => Number.isInteger(value[key]) && Number(value[key]) >= 0,
    )
  );
}

export const validReference = (value: unknown): value is AnalysisReference =>
  isRecord(value) && snapshotId(value.snapshot_id) && cutoffString(value.decision_cutoff_gmt);

export const sameAnalysis = (left: AnalysisReference, right: AnalysisReference) =>
  left.snapshot_id === right.snapshot_id && left.decision_cutoff_gmt === right.decision_cutoff_gmt;

export const metadataReference = (metadata: Metadata): AnalysisReference => ({
  snapshot_id: metadata.snapshot.content_sha256,
  decision_cutoff_gmt: metadata.decision_cutoff_gmt,
});

export function rangeResponse(
  value: unknown,
  from: string,
  to: string,
): value is Record<string, unknown> & { meta: AnalysisReference } {
  return (
    isRecord(value) &&
    validReference(value.meta) &&
    value.decision_date_from === from &&
    value.decision_date_to === to
  );
}

export function metricsForHours(value: unknown, expected: number): value is Metrics {
  if (!validMetrics(value)) return false;
  const metrics = value as Metrics;
  const matched = metrics.coverage.matched_hours;
  return (
    metrics.coverage.expected_hours === expected &&
    matched <= expected &&
    metrics.overforecast_hours + metrics.underforecast_hours + metrics.exact_hours === matched &&
    (matched === 0
      ? [metrics.mae_mw, metrics.bias_mw, metrics.p90_absolute_error_mw].every((v) => v === null)
      : [metrics.mae_mw, metrics.bias_mw, metrics.p90_absolute_error_mw].every(finite))
  );
}

export function invalidAnalysis(label: string): never {
  throw new ApiError(
    `The service returned unexpected ${label} data. Please try again.`,
    'invalid_response',
  );
}

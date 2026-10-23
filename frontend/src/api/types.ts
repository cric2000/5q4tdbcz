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

export interface SetupStatus {
  health: Health;
  config: PilotConfig;
}

export interface AnalysisReference {
  snapshot_id: string;
  decision_cutoff_gmt: string;
}

export interface Metadata extends PilotConfig {
  timezone: 'UTC';
  power_unit: 'MW';
  comparison_resolution_minutes: 60;
  actuals_are_retrospective: true;
  actual_aggregation: string;
  error_definition: string;
  percentile_method: string;
  sources: { dataset: string; documentation_url: string; native_resolution: string; unit: 'MW' }[];
  snapshot: {
    content_sha256: string;
    retrieved_at: string;
    forecast_records: number;
    outturn_half_hours: number;
  };
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

export type MissingReason =
  | 'missing_forecast'
  | 'no_eligible_forecast'
  | 'missing_actual_first_half'
  | 'missing_actual_second_half';

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

export interface HistogramBin {
  lower_mw: number;
  upper_mw: number;
  count: number;
  upper_inclusive: boolean;
}

export interface Accuracy {
  meta: AnalysisReference;
  decision_date_from: string;
  decision_date_to: string;
  metrics: Metrics;
  error_histogram: HistogramBin[];
  worst_hours: HourlyComparison[];
}

export interface DailyMetric {
  decision_date: string;
  delivery_date: string;
  cutoff: string;
  metrics: Metrics;
}

export interface DailyAccuracy {
  meta: AnalysisReference;
  decision_date_from: string;
  decision_date_to: string;
  days: DailyMetric[];
}

export interface ForecastPublication {
  publish_time: string;
  generation_mw: number;
  available_at_cutoff: boolean;
  selected_as_of: boolean;
  value_changed_from_previous: boolean | null;
}

export interface Evolution {
  meta: AnalysisReference;
  decision_date: string;
  delivery_date: string;
  cutoff: string;
  comparison: HourlyComparison;
  publications: ForecastPublication[];
}

export interface PriorAccuracy {
  meta: AnalysisReference;
  decision_date: string;
  cutoff: string;
  delivery_start: string | null;
  delivery_end: string | null;
  metrics: Metrics;
}

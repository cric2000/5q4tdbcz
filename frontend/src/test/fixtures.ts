// Synthetic API contracts for UI tests only. Production screens always request the API.
import type { Decision, Metadata, PilotConfig } from '../api';

export const health = { status: 'ok', service: 'windsight', phase: 'ingestion', data_status: 'snapshot_ready' };
export const config: PilotConfig = {
  decision_cutoff_gmt: '10:15', cutoff_reference_url: 'https://support.nordpoolgroup.com/reference', cutoff_is_assumed: true,
  decision_date_from: '2026-01-01', decision_date_to: '2026-01-31', delivery_date_from: '2026-01-02', delivery_date_to: '2026-02-01',
};
export const metadata: Metadata = {
  ...config, timezone: 'UTC', power_unit: 'MW', comparison_resolution_minutes: 60, actuals_are_retrospective: true,
  actual_aggregation: 'Mean of two half-hour readings', error_definition: 'Forecast minus actual', percentile_method: 'Linear interpolation',
  sources: [{ dataset: 'WINDFOR', documentation_url: 'https://bmrs.elexon.co.uk/forecast', native_resolution: 'Hourly', unit: 'MW' }, { dataset: 'FUELHH WIND', documentation_url: 'https://bmrs.elexon.co.uk/actual', native_resolution: 'Half-hourly', unit: 'MW' }],
  snapshot: { content_sha256: 'a'.repeat(64), retrieved_at: '2026-10-23T12:00:00Z', forecast_records: 100, outturn_half_hours: 48 },
  limitations: ['WINDFOR and FUELHH may cover different populations.'],
};
export function decision(date = '2026-01-01', forecast = 120): Decision {
  const delivery = new Date(`${date}T00:00:00Z`);
  delivery.setUTCDate(delivery.getUTCDate() + 1);
  const error = forecast - 110;
  return {
    meta: { snapshot_id: metadata.snapshot.content_sha256, decision_cutoff_gmt: config.decision_cutoff_gmt },
    decision_date: date, delivery_date: delivery.toISOString().slice(0, 10), cutoff: `${date}T10:15:00Z`,
    hours: Array.from({ length: 24 }, (_, index) => ({
      target_time: new Date(delivery.getTime() + index * 3600000).toISOString().replace('.000Z', 'Z'),
      forecast_mw: forecast, forecast_published_at: `${date}T10:00:00Z`, forecast_age_hours_at_cutoff: 0.25,
      actual_half_hours_mw: [100, 120], actual_mw: 110, error_mw: error, absolute_error_mw: Math.abs(error), status: 'matched', missing_reasons: [],
    })),
    metrics: {
      coverage: { expected_hours: 24, matched_hours: 24, coverage_percent: 100, missing_forecast_hours: 0, no_eligible_forecast_hours: 0, incomplete_actual_hours: 0 },
      mae_mw: Math.abs(error), rmse_mw: Math.abs(error), bias_mw: error, p50_absolute_error_mw: Math.abs(error), p90_absolute_error_mw: Math.abs(error), max_absolute_error_mw: Math.abs(error),
      overforecast_hours: error > 0 ? 24 : 0, underforecast_hours: error < 0 ? 24 : 0, exact_hours: error === 0 ? 24 : 0,
      overforecast_percent: error > 0 ? 100 : 0, underforecast_percent: error < 0 ? 100 : 0, exact_percent: error === 0 ? 100 : 0,
    },
  };
}
export function emptyDecision(): Decision {
  const value = decision();
  value.hours = value.hours.map((hour) => ({ ...hour, forecast_mw: null, forecast_published_at: null, forecast_age_hours_at_cutoff: null, actual_half_hours_mw: [null, null], actual_mw: null, error_mw: null, absolute_error_mw: null, status: 'missing_data', missing_reasons: ['missing_forecast', 'missing_actual_first_half', 'missing_actual_second_half'] }));
  value.metrics = {
    coverage: { expected_hours: 24, matched_hours: 0, coverage_percent: 0, missing_forecast_hours: 24, no_eligible_forecast_hours: 0, incomplete_actual_hours: 24 },
    mae_mw: null, rmse_mw: null, bias_mw: null, p50_absolute_error_mw: null, p90_absolute_error_mw: null, max_absolute_error_mw: null,
    overforecast_hours: 0, underforecast_hours: 0, exact_hours: 0, overforecast_percent: null, underforecast_percent: null, exact_percent: null,
  };
  return value;
}
export const response = (value: unknown) => ({ ok: true, json: async () => value });

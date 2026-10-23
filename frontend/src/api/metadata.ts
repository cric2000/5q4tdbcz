import { ApiError, getJson } from '@/api/client';
import type { Metadata } from '@/api/types';
import {
  cutoffString,
  dateString,
  finite,
  httpsUrl,
  isRecord,
  snapshotId,
  timestamp,
} from '@/api/validation';

export async function loadMetadata(_key: string, signal: AbortSignal): Promise<Metadata> {
  const value = await getJson('/api/v1/metadata', signal);
  if (
    !isRecord(value) ||
    !['decision_date_from', 'decision_date_to', 'delivery_date_from', 'delivery_date_to'].every(
      (key) => dateString(value[key]),
    ) ||
    !cutoffString(value.decision_cutoff_gmt) ||
    value.cutoff_is_assumed !== true ||
    !httpsUrl(value.cutoff_reference_url) ||
    value.timezone !== 'UTC' ||
    value.power_unit !== 'MW' ||
    value.comparison_resolution_minutes !== 60 ||
    value.actuals_are_retrospective !== true ||
    !['actual_aggregation', 'error_definition', 'percentile_method'].every(
      (key) => typeof value[key] === 'string',
    ) ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    !value.sources.every(
      (source) =>
        isRecord(source) &&
        typeof source.dataset === 'string' &&
        httpsUrl(source.documentation_url) &&
        typeof source.native_resolution === 'string' &&
        source.unit === 'MW',
    ) ||
    !isRecord(value.snapshot) ||
    !snapshotId(value.snapshot.content_sha256) ||
    !timestamp(value.snapshot.retrieved_at) ||
    !finite(value.snapshot.forecast_records) ||
    !finite(value.snapshot.outturn_half_hours) ||
    !Array.isArray(value.limitations) ||
    !value.limitations.every((item) => typeof item === 'string')
  ) {
    throw new ApiError(
      'The service returned unexpected metadata. Please refresh and try again.',
      'invalid_response',
    );
  }
  return value as unknown as Metadata;
}

import { getJson } from '@/api/client';
import type { Evolution, HourlyComparison } from '@/api/types';
import {
  finite,
  invalidAnalysis,
  isRecord,
  timestamp,
  validHour,
  validReference,
} from '@/api/validation';
import { dayMs } from '@/lib/dates';

export async function loadEvolution(target: string, signal: AbortSignal): Promise<Evolution> {
  const value = await getJson(
    `/api/v1/evolution?target_time=${encodeURIComponent(target)}`,
    signal,
  );
  const delivery = target.slice(0, 10);
  const decision = new Date(Date.parse(target.slice(0, 10) + 'T00:00:00Z') - dayMs)
    .toISOString()
    .slice(0, 10);
  if (
    !isRecord(value) ||
    !validReference(value.meta) ||
    value.delivery_date !== delivery ||
    value.decision_date !== decision ||
    value.cutoff !== `${decision}T${value.meta.decision_cutoff_gmt}:00Z` ||
    !validHour(value.comparison) ||
    (value.comparison as HourlyComparison).target_time !== target ||
    !Array.isArray(value.publications)
  )
    invalidAnalysis('forecast history');
  const publications = value.publications;
  if (
    !publications.every(
      (row, index) =>
        isRecord(row) &&
        timestamp(row.publish_time) &&
        finite(row.generation_mw) &&
        typeof row.selected_as_of === 'boolean' &&
        row.available_at_cutoff ===
          Date.parse(row.publish_time) <= Date.parse(value.cutoff as string) &&
        (index === 0
          ? row.value_changed_from_previous === null
          : Date.parse(row.publish_time) > Date.parse(publications[index - 1].publish_time) &&
            row.value_changed_from_previous ===
              (row.generation_mw !== publications[index - 1].generation_mw)),
    )
  )
    invalidAnalysis('forecast history');
  const comparison = value.comparison as HourlyComparison;
  const eligible = publications.filter((row) => row.available_at_cutoff);
  const selected = eligible.at(-1);
  if (
    !publications.every((row) => row.selected_as_of === (row === selected)) ||
    comparison.forecast_published_at !== (selected?.publish_time ?? null) ||
    comparison.forecast_mw !== (selected?.generation_mw ?? null)
  )
    invalidAnalysis('forecast history');
  return value as unknown as Evolution;
}

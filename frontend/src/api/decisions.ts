import { ApiError, getJson } from '@/api/client';
import type { Decision, HourlyComparison, PriorAccuracy } from '@/api/types';
import {
  cutoffString,
  invalidAnalysis,
  isRecord,
  metricsForHours,
  snapshotId,
  validHour,
  validMetrics,
  validReference,
} from '@/api/validation';

export async function loadDecision(date: string, signal: AbortSignal): Promise<Decision> {
  const value = await getJson(`/api/v1/decisions/${encodeURIComponent(date)}`, signal);
  const delivery = new Date(`${date}T00:00:00Z`);
  delivery.setUTCDate(delivery.getUTCDate() + 1);
  const expectedDelivery = delivery.toISOString().slice(0, 10);
  if (
    !isRecord(value) ||
    !isRecord(value.meta) ||
    !snapshotId(value.meta.snapshot_id) ||
    !cutoffString(value.meta.decision_cutoff_gmt) ||
    value.decision_date !== date ||
    value.delivery_date !== expectedDelivery ||
    value.cutoff !== `${date}T${value.meta.decision_cutoff_gmt}:00Z` ||
    !Array.isArray(value.hours) ||
    value.hours.length !== 24 ||
    !value.hours.every(validHour) ||
    !value.hours.every(
      (hour: HourlyComparison, index: number) =>
        Date.parse(hour.target_time) === delivery.getTime() + index * 3600000,
    ) ||
    !validMetrics(value.metrics)
  ) {
    throw new ApiError(
      'The service returned unexpected replay data. Please try again.',
      'invalid_response',
    );
  }
  return value as unknown as Decision;
}

/** The server filters both delivery completion and actual-publication availability. */
export async function loadPriorAccuracy(key: string, signal: AbortSignal): Promise<PriorAccuracy> {
  const [date, deliveryStart, cutoffTime] = key.split('|');
  const value = await getJson(
    `/api/v1/decisions/${encodeURIComponent(date)}/prior-accuracy`,
    signal,
  );
  const cutoff = `${date}T${cutoffTime}:00Z`;
  const start = `${deliveryStart}T00:00:00Z`;
  const expected = Math.max(0, Math.floor((Date.parse(cutoff) - Date.parse(start)) / 3600000));
  const end = new Date(Date.parse(start) + expected * 3600000).toISOString().replace('.000Z', 'Z');
  if (
    !isRecord(value) ||
    !validReference(value.meta) ||
    value.decision_date !== date ||
    value.cutoff !== cutoff ||
    value.delivery_start !== (expected ? start : null) ||
    value.delivery_end !== (expected ? end : null) ||
    !metricsForHours(value.metrics, expected)
  )
    invalidAnalysis('historical accuracy');
  return value as unknown as PriorAccuracy;
}

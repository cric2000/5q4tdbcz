import { getJson } from '@/api/client';
import type { Accuracy, DailyAccuracy, Metrics } from '@/api/types';
import {
  finite,
  invalidAnalysis,
  isRecord,
  metricsForHours,
  rangeResponse,
  sameAnalysis,
  validHour,
} from '@/api/validation';
import { dayMs } from '@/lib/dates';

/** Both range results must describe the same snapshot and cutoff before either is displayed. */
export async function loadAccuracyRange(
  key: string,
  signal: AbortSignal,
): Promise<{ overall: Accuracy; daily: DailyAccuracy }> {
  const [from, to] = key.split('|');
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const [overall, daily] = await Promise.all([
    getJson(`/api/v1/accuracy?${query}`, signal),
    getJson(`/api/v1/accuracy/daily?${query}`, signal),
  ]);
  const start = Date.parse(`${from}T00:00:00Z`);
  const dayCount = (Date.parse(`${to}T00:00:00Z`) - start) / dayMs + 1;
  if (
    !rangeResponse(overall, from, to) ||
    !metricsForHours(overall.metrics, dayCount * 24) ||
    !Array.isArray(overall.error_histogram) ||
    !Array.isArray(overall.worst_hours) ||
    !rangeResponse(daily, from, to) ||
    !sameAnalysis(overall.meta, daily.meta) ||
    !Array.isArray(daily.days) ||
    daily.days.length !== dayCount
  )
    invalidAnalysis('accuracy');
  const metrics = overall.metrics as Metrics;
  const bins = overall.error_histogram;
  if (
    !bins.every(
      (bin, index) =>
        isRecord(bin) &&
        finite(bin.lower_mw) &&
        finite(bin.upper_mw) &&
        bin.lower_mw <= bin.upper_mw &&
        Number.isInteger(bin.count) &&
        Number(bin.count) >= 0 &&
        bin.upper_inclusive === (index === bins.length - 1) &&
        (index === 0 || bins[index - 1].upper_mw === bin.lower_mw),
    ) ||
    bins.reduce((total, bin) => total + bin.count, 0) !== metrics.coverage.matched_hours ||
    overall.worst_hours.length !== Math.min(10, metrics.coverage.matched_hours) ||
    !overall.worst_hours.every(
      (hour, index, hours) =>
        validHour(hour) &&
        hour.status === 'matched' &&
        finite(hour.absolute_error_mw) &&
        finite(hour.error_mw) &&
        Date.parse(hour.target_time) >= start + dayMs &&
        Date.parse(hour.target_time) < start + (dayCount + 1) * dayMs &&
        Date.parse(hour.target_time) % 3600000 === 0 &&
        (index === 0 ||
          hours[index - 1].absolute_error_mw > hour.absolute_error_mw ||
          (hours[index - 1].absolute_error_mw === hour.absolute_error_mw &&
            hours[index - 1].target_time < hour.target_time)),
    ) ||
    !daily.days.every(
      (day, index) =>
        isRecord(day) &&
        day.decision_date === new Date(start + index * dayMs).toISOString().slice(0, 10) &&
        day.delivery_date === new Date(start + (index + 1) * dayMs).toISOString().slice(0, 10) &&
        day.cutoff === `${day.decision_date}T${daily.meta.decision_cutoff_gmt}:00Z` &&
        metricsForHours(day.metrics, 24),
    )
  )
    invalidAnalysis('accuracy');
  return { overall: overall as unknown as Accuracy, daily: daily as unknown as DailyAccuracy };
}

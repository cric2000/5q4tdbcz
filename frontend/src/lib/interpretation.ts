import type { Metrics } from '@/api';

/** Explain the supply-planning implication without inferring a utility's purchase quantity. */
export function supplyImplication(forecastMinusActual: number | null) {
  if (forecastMinusActual === null || forecastMinusActual === 0) return null;
  return forecastMinusActual > 0
    ? 'Relying on that wind forecast could have led you to underestimate how much electricity you needed from other sources.'
    : 'Relying on that wind forecast could have led you to overestimate how much electricity you needed from other sources.';
}
export function averageGapNote(
  metrics: Pick<Metrics, 'overforecast_hours' | 'underforecast_hours'>,
) {
  return (metrics.overforecast_hours > 0 && metrics.underforecast_hours === 0) ||
    (metrics.underforecast_hours > 0 && metrics.overforecast_hours === 0)
    ? 'All misses were in the same direction, so MAE and the size of bias are equal.'
    : null;
}

import type { MissingReason } from '@/api';

export const reasonText: Record<MissingReason, string> = {
  missing_forecast: 'No forecast acquired',
  no_eligible_forecast: 'No forecast available before cutoff',
  missing_actual_first_half: 'First actual half-hour missing',
  missing_actual_second_half: 'Second actual half-hour missing',
};

import { dateLabel } from './format';

export const dayMs = 86400000;
const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const month = (value: Date) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(value);
const sameMonth = (start: Date, end: Date) =>
  start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();

/** Human-readable input scope, derived from the server's bounds rather than duplicated dates. */
export function dateRangeLabel(from: string, to: string) {
  if (from === to) return dateLabel(from);
  const start = utcDate(from),
    end = utcDate(to);
  const first = sameMonth(start, end)
    ? String(start.getUTCDate())
    : start.getUTCFullYear() === end.getUTCFullYear()
      ? `${start.getUTCDate()} ${month(start)}`
      : dateLabel(from);
  return `${first} to ${end.getUTCDate()} ${month(end)} ${end.getUTCFullYear()}`;
}

export function scopePeriodLabel(from: string, to: string) {
  const start = utcDate(from),
    end = utcDate(to);
  return sameMonth(start, end)
    ? `${month(start)} ${start.getUTCFullYear()}`
    : `${dateLabel(from)}–${dateLabel(to)}`;
}

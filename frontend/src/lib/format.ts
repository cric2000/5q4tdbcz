export const number = (value: number | null, decimals = 1) =>
  value === null
    ? '—'
    : new Intl.NumberFormat('en-GB', { maximumFractionDigits: decimals }).format(value);
export const power = (value: number | null) =>
  value === null ? 'Unavailable' : `${number(value)} MW`;
export const signed = (value: number | null) =>
  value === null ? '—' : `${value > 0 ? '+' : ''}${number(value)}`;
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
export const hourLabel = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(new Date(value));
export const timestampLabel = (value: string | null) =>
  value === null
    ? 'Unavailable'
    : new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'UTC',
      }).format(new Date(value));

import { reasonText } from './labels';
import type { Decision } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dateLabel, hourLabel, number, signed, timestampLabel } from '@/lib/format';
import { Check } from 'lucide-react';

export function Evidence({
  decision,
  selected,
  onSelect,
}: {
  decision: Decision;
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section aria-labelledby="evidence-title">
      <h2 id="evidence-title" className="text-base font-semibold">
        Hourly evidence
      </h2>
      <p
        id="table-help"
        className="mt-2 mb-4 max-w-3xl text-xs leading-relaxed text-muted-foreground"
      >
        Hourly actual power is the average of the first and second half-hour readings. Positive
        difference means the forecast was high; negative means low. A dash means unavailable. All
        times are UTC.
      </p>
      <div
        className="overflow-x-auto rounded-sm border"
        role="region"
        aria-label="Hourly evidence table, scroll horizontally for all columns"
        tabIndex={0}
      >
        <table className="w-full text-right text-xs tabular-nums" aria-describedby="table-help">
          <caption className="sr-only">
            Forecast selection and actual readings for {dateLabel(decision.delivery_date)} delivery,
            using {timestampLabel(decision.cutoff)} UTC cutoff.
          </caption>
          <thead className="border-b bg-neutral-50 text-[10px] text-neutral-500">
            <tr>
              {[
                'Hour UTC',
                'Forecast MW',
                'Published UTC',
                'Actual: first 30 min MW',
                'Actual: second 30 min MW',
                'Hourly actual MW',
                'Forecast − actual MW',
                'Data status',
              ].map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={`px-3 py-3 font-medium whitespace-nowrap ${index === 0 || index === 7 ? 'text-left' : ''}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decision.hours.map((row, index) => (
              <tr
                key={row.target_time}
                className={`border-b last:border-0 ${selected === index ? 'bg-green-50/70' : 'even:bg-neutral-50/40'}`}
              >
                <th scope="row" className="px-2 py-2 text-left">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    aria-label={`Inspect ${hourLabel(row.target_time)} UTC`}
                    aria-pressed={selected === index}
                    onClick={() => onSelect(index)}
                  >
                    {hourLabel(row.target_time)}
                  </Button>
                </th>
                <td className="px-3 py-3">{number(row.forecast_mw)}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {row.forecast_published_at ? timestampLabel(row.forecast_published_at) : '—'}
                </td>
                <td className="px-3 py-3">{number(row.actual_half_hours_mw[0])}</td>
                <td className="px-3 py-3">{number(row.actual_half_hours_mw[1])}</td>
                <td className="px-3 py-3">{number(row.actual_mw)}</td>
                <td
                  className={`px-3 py-3 ${row.error_mw !== null && row.error_mw > 0 ? 'text-amber-700' : 'text-actual'}`}
                >
                  {signed(row.error_mw)}
                </td>
                <td className="min-w-28 px-3 py-3 text-left">
                  {row.status === 'matched' ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-actual/20 bg-actual/5 text-[10px] font-normal text-actual"
                    >
                      <Check className="size-2.5" aria-hidden="true" />
                      Compared
                    </Badge>
                  ) : (
                    <span className="block min-w-40 text-[11px] leading-relaxed text-amber-800">
                      {row.missing_reasons.map((reason) => reasonText[reason]).join('; ') ||
                        'Missing data'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

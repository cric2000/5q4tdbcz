import { reasonText } from './labels';
import type { Decision } from '@/api';
import { Button } from '@/components/ui/button';
import { hourLabel, power, signed, timestampLabel } from '@/lib/format';
import { supplyImplication } from '@/lib/interpretation';
import { ArrowDownRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import type { RefObject } from 'react';

export function HourInspector({
  decision,
  selected,
  onSelect,
  detailsRef,
}: {
  decision: Decision;
  selected: number;
  onSelect: (index: number) => void;
  detailsRef: RefObject<HTMLElement | null>;
}) {
  const hour = decision.hours[selected];
  const DifferenceIcon =
    hour.error_mw === null
      ? Info
      : hour.error_mw === 0
        ? Check
        : hour.error_mw > 0
          ? ArrowDownRight
          : ArrowUpRight;
  return (
    <section
      ref={detailsRef}
      tabIndex={-1}
      aria-label="Selected hour details"
      className="scroll-mt-6 p-5 outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-neutral-500">Selected delivery hour</p>
          <h3
            className="mt-1 text-lg font-semibold tracking-tight tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {hourLabel(hour.target_time)}–{String((selected + 1) % 24).padStart(2, '0')}:00 UTC
          </h3>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-11 bg-white"
            aria-label="Previous delivery hour"
            disabled={selected === 0}
            onClick={() => onSelect(selected - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11 bg-white"
            aria-label="Next delivery hour"
            disabled={selected === 23}
            onClick={() => onSelect(selected + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      <dl className="space-y-3">
        <div className="rounded-sm border border-primary/20 bg-primary/5 p-4 sm:p-5">
          <dt className="flex items-center gap-2 text-xs font-medium text-neutral-600">
            <span
              aria-hidden="true"
              className="h-0.5 w-4 border-t-2 border-dashed border-primary"
            />
            Available at the buying deadline
          </dt>
          <dd className="mt-2 text-3xl font-semibold tracking-tight text-primary tabular-nums">
            {power(hour.forecast_mw)}
          </dd>
          <p className="mt-2 text-xs font-medium text-primary">Expected wind power · forecast</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Forecast published: {timestampLabel(hour.forecast_published_at)}
            {hour.forecast_published_at ? ' UTC' : ''}
          </p>
        </div>
        <div className="rounded-sm border border-actual/15 bg-neutral-50/70 p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-neutral-600">
            <span aria-hidden="true" className="h-0.5 w-4 bg-actual" />
            Known only after delivery
          </dt>
          <dd className="mt-2 text-3xl font-semibold tracking-tight text-actual tabular-nums">
            {power(hour.actual_mw)}
          </dd>
          <p className="mt-1 text-xs text-neutral-500">Reported wind power · actual</p>
        </div>
      </dl>
      <div className="mt-3 flex items-start gap-3 rounded-lg border bg-white p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-neutral-100 text-neutral-600">
          <DifferenceIcon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-500">What happened</p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-neutral-900 sm:text-base">
            {hour.error_mw === null ? (
              'Difference unavailable'
            ) : hour.error_mw === 0 ? (
              'Forecast matched reported wind power'
            ) : (
              <>
                {power(Math.abs(hour.error_mw))} {hour.error_mw > 0 ? 'lower' : 'higher'} than
                forecast
              </>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            {hour.error_mw === null
              ? 'Both forecast and actual power are needed to compare this hour.'
              : `Forecast − actual = ${signed(hour.error_mw)} MW`}
          </p>
          {supplyImplication(hour.error_mw) && (
            <p className="mt-2 text-xs leading-relaxed text-foreground">
              {supplyImplication(hour.error_mw)}
            </p>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        All times use UTC to keep forecasts, actuals and the buying deadline aligned. For this
        historical period, UTC matches UK local time (GMT).
      </p>
      {hour.missing_reasons.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-amber-800">
          {hour.missing_reasons.map((reason) => reasonText[reason]).join(' · ')}
        </p>
      )}
    </section>
  );
}

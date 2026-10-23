import type { Decision } from '@/api';
import { Button } from '@/components/ui/button';
import { hourLabel, power, timestampLabel } from '@/lib/format';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { RefObject } from 'react';

export function ForecastAnswer({
  decision,
  selected,
  onSelect,
  detailsRef,
}: {
  decision: Decision;
  selected: number;
  onSelect: (hour: number) => void;
  detailsRef: RefObject<HTMLElement | null>;
}) {
  const hour = decision.hours[selected];
  return (
    <section
      ref={detailsRef}
      tabIndex={-1}
      className="flex scroll-mt-5 flex-wrap items-center justify-between gap-4 p-5 outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25 sm:px-6"
      aria-label="Buying-time forecast"
    >
      <div>
        <p className="text-xs text-muted-foreground">
          {hourLabel(hour.target_time)}–{String((selected + 1) % 24).padStart(2, '0')}:00 UTC
        </p>
        <p
          className="mt-1 text-[32px] font-semibold tracking-tight text-primary tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {power(hour.forecast_mw)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Published {timestampLabel(hour.forecast_published_at)}
          {hour.forecast_published_at ? ' UTC' : ''}
        </p>
        {hour.forecast_mw === null && (
          <p className="mt-1 text-xs text-amber-800">
            No eligible forecast is available for this hour.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-10"
          aria-label="Previous forecast hour"
          disabled={selected === 0}
          onClick={() => onSelect(selected - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-10"
          aria-label="Next forecast hour"
          disabled={selected === 23}
          onClick={() => onSelect(selected + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </section>
  );
}

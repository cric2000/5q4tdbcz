import { loadEvolution, metadataReference, sameAnalysis } from '@/api';
import type { Metadata } from '@/api';
import {
  AnalysisReferenceError,
  ErrorPanel,
  LoadingPanel,
} from '@/components/feedback/RequestState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EvolutionResults } from '@/features/evolution/EvolutionResults';
import { useResource } from '@/hooks/useResource';
import { dateRangeLabel } from '@/lib/dates';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export function EvolutionView({
  metadata,
  refresh,
  initialTarget,
}: {
  metadata: Metadata;
  refresh: () => void;
  initialTarget: string | null;
}) {
  const [target, setTarget] = useState(initialTarget ?? `${metadata.delivery_date_from}T00:00:00Z`);
  const [dateError, setDateError] = useState('');
  const { resource, reload } = useResource(target, loadEvolution);
  const first = `${metadata.delivery_date_from}T00:00:00Z`,
    last = `${metadata.delivery_date_to}T23:00:00Z`;
  const shift = (offset: number) => {
    setTarget(new Date(Date.parse(target) + offset * 3600000).toISOString().replace('.000Z', 'Z'));
    setDateError('');
  };
  const chooseDate = (date: string) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < metadata.delivery_date_from ||
      date > metadata.delivery_date_to
    ) {
      setDateError(
        `Choose a delivery day from ${dateRangeLabel(metadata.delivery_date_from, metadata.delivery_date_to)}.`,
      );
      return;
    }
    setTarget(date + target.slice(10));
    setDateError('');
  };
  return (
    <div className="space-y-5">
      <Card className="gap-4 rounded-lg p-5 shadow-none sm:p-6">
        <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,220px)_auto]">
          <div>
            <label htmlFor="evolution-date" className="mb-2 block text-xs font-medium">
              Delivery day
            </label>
            <Input
              id="evolution-date"
              className="h-10"
              type="date"
              min={metadata.delivery_date_from}
              max={metadata.delivery_date_to}
              value={target.slice(0, 10)}
              onInput={(e) => chooseDate(e.currentTarget.value)}
              onChange={(e) => chooseDate(e.target.value)}
              aria-describedby="evolution-help"
              aria-invalid={Boolean(dateError)}
            />
          </div>
          <div>
            <label htmlFor="evolution-hour" className="mb-2 block text-xs font-medium">
              Delivery hour · UTC / GMT
            </label>
            <select
              id="evolution-hour"
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
              value={target.slice(11, 13)}
              onChange={(e) => setTarget(`${target.slice(0, 10)}T${e.target.value}:00:00Z`)}
            >
              {Array.from({ length: 24 }, (_, index) => (
                <option key={index} value={String(index).padStart(2, '0')}>
                  {String(index).padStart(2, '0')}:00–
                  {String((index + 1) % 24).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              aria-label="Previous target hour"
              disabled={target === first}
              onClick={() => shift(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              aria-label="Next target hour"
              disabled={target === last}
              onClick={() => shift(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <p
          id="evolution-help"
          className={`text-xs leading-relaxed ${dateError ? 'text-destructive' : 'text-muted-foreground'}`}
          role={dateError ? 'alert' : undefined}
        >
          {dateError ||
            'Choose when the electricity is delivered. The buying decision and its deadline are on the day before. All times are UTC, which matches UK local time (GMT) for this historical period.'}
        </p>
      </Card>
      {resource.state === 'loading' && (
        <LoadingPanel message="Loading publications for this delivery hour…" />
      )}
      {resource.state === 'error' && <ErrorPanel message={resource.error.message} retry={reload} />}
      {resource.state === 'ready' &&
        (sameAnalysis(resource.value.meta, metadataReference(metadata)) ? (
          <EvolutionResults key={target} evolution={resource.value} />
        ) : (
          <AnalysisReferenceError refresh={refresh} />
        ))}
    </div>
  );
}

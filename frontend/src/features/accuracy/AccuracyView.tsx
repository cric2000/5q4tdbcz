import { loadAccuracyRange, metadataReference, sameAnalysis } from '@/api';
import type { Metadata } from '@/api';
import {
  AnalysisReferenceError,
  ErrorPanel,
  LoadingPanel,
} from '@/components/feedback/RequestState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AccuracyResults } from '@/features/accuracy/AccuracyResults';
import { useResource } from '@/hooks/useResource';
import { scopePeriodLabel } from '@/lib/dates';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

export function AccuracyView({
  metadata,
  refresh,
  onInspect,
}: {
  metadata: Metadata;
  refresh: () => void;
  onInspect: (target: string) => void;
}) {
  const [from, setFrom] = useState(metadata.decision_date_from);
  const [to, setTo] = useState(metadata.decision_date_to);
  const [range, setRange] = useState(`${metadata.decision_date_from}|${metadata.decision_date_to}`);
  const [error, setError] = useState('');
  const { resource, reload } = useResource(range, loadAccuracyRange);
  return (
    <div className="space-y-5">
      <Card className="gap-4 rounded-lg p-5 shadow-none sm:p-6">
        <form
          className="grid items-end gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,200px)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !from ||
              !to ||
              from < metadata.decision_date_from ||
              to > metadata.decision_date_to ||
              from > to
            ) {
              setError(
                `Choose buying dates within ${scopePeriodLabel(metadata.decision_date_from, metadata.decision_date_to)}, with the start on or before the end.`,
              );
              return;
            }
            setError('');
            setRange(`${from}|${to}`);
          }}
          noValidate
          aria-label="Accuracy date range"
        >
          <div>
            <label htmlFor="accuracy-from" className="mb-2 block text-xs font-medium">
              First buying day
            </label>
            <Input
              id="accuracy-from"
              className="h-10"
              type="date"
              min={metadata.decision_date_from}
              max={metadata.decision_date_to}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              onInput={(e) => setFrom(e.currentTarget.value)}
              aria-describedby="range-help"
              aria-invalid={Boolean(error)}
            />
          </div>
          <div>
            <label htmlFor="accuracy-to" className="mb-2 block text-xs font-medium">
              Last buying day
            </label>
            <Input
              id="accuracy-to"
              className="h-10"
              type="date"
              min={metadata.decision_date_from}
              max={metadata.decision_date_to}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onInput={(e) => setTo(e.currentTarget.value)}
              aria-describedby="range-help"
              aria-invalid={Boolean(error)}
            />
          </div>
          <Button type="submit" className="h-10 justify-self-start">
            Update analysis
            <ArrowRight aria-hidden="true" />
          </Button>
        </form>
        <p
          id="range-help"
          className={`text-xs leading-relaxed ${error ? 'text-destructive' : 'text-muted-foreground'}`}
          role={error ? 'alert' : undefined}
        >
          {error ||
            `Select buying days, not delivery days. Each uses the latest forecast published by ${metadata.decision_cutoff_gmt} GMT for next-day delivery. This is an assumed deadline; the client’s deadline is to be confirmed.`}
        </p>
      </Card>
      {resource.state === 'loading' && (
        <LoadingPanel message="Comparing the selected buying days…" />
      )}
      {resource.state === 'error' && <ErrorPanel message={resource.error.message} retry={reload} />}
      {resource.state === 'ready' &&
        (sameAnalysis(resource.value.overall.meta, metadataReference(metadata)) ? (
          <AccuracyResults
            overall={resource.value.overall}
            daily={resource.value.daily}
            onInspect={onInspect}
          />
        ) : (
          <AnalysisReferenceError refresh={refresh} />
        ))}
    </div>
  );
}

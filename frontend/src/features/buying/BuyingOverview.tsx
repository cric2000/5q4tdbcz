import { loadDecision, loadPriorAccuracy, metadataReference, sameAnalysis } from '@/api';
import type { Metadata, PriorAccuracy } from '@/api';
import { AnalysisWorkspace } from '@/components/analysis/AnalysisWorkspace';
import { Methodology } from '@/components/analysis/Methodology';
import {
  AnalysisReferenceError,
  ErrorPanel,
  LoadingPanel,
} from '@/components/feedback/RequestState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DecisionResults } from '@/features/buying/DecisionResults';
import type { ReplayActions } from '@/features/buying/types';
import { useResource } from '@/hooks/useResource';
import type { Resource } from '@/hooks/useResource';
import { dateRangeLabel, scopePeriodLabel } from '@/lib/dates';
import { dateLabel } from '@/lib/format';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, Info } from 'lucide-react';
import { useState } from 'react';

export default function BuyingOverview(actions: ReplayActions) {
  return (
    <AnalysisWorkspace>
      {(metadata, refreshMetadata) => (
        <ReplayWorkspace metadata={metadata} refreshMetadata={refreshMetadata} {...actions} />
      )}
    </AnalysisWorkspace>
  );
}

function ReplayWorkspace({
  metadata,
  refreshMetadata,
  ...actions
}: {
  metadata: Metadata;
  refreshMetadata: () => void;
} & ReplayActions) {
  const date = actions.decisionDate ?? metadata.decision_date_from;
  const setDate = actions.onDecisionDateChange;
  const { resource: history, reload: retryHistory } = useResource(
    `${date}|${metadata.delivery_date_from}|${metadata.decision_cutoff_gmt}`,
    loadPriorAccuracy,
  );
  const [dateError, setDateError] = useState('');
  const chooseDate = (value: string) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      value < metadata.decision_date_from ||
      value > metadata.decision_date_to
    ) {
      setDateError(
        `Choose a buying date from ${dateRangeLabel(metadata.decision_date_from, metadata.decision_date_to)}.`,
      );
      return;
    }
    setDateError('');
    setDate(value);
  };
  const delivery = new Date(`${date}T00:00:00Z`);
  delivery.setUTCDate(delivery.getUTCDate() + 1);
  const shiftDate = (offset: number) => {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    setDate(next.toISOString().slice(0, 10));
    setDateError('');
  };
  return (
    <>
      <Card className="gap-0 py-0 shadow-none" aria-label="Decision date selection" role="region">
        <div className="grid grid-cols-2 gap-0 divide-y sm:grid-cols-[1.15fr_1fr_1fr] sm:divide-x sm:divide-y-0">
          <div className="col-span-2 p-4 sm:col-span-1 sm:p-5">
            <label
              htmlFor="decision-date"
              className="mb-2 block text-xs font-medium text-neutral-600"
            >
              Buying decision date
            </label>
            <div className="flex max-w-[320px] items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-10 shrink-0 bg-white"
                aria-label="Previous decision day"
                disabled={date === metadata.decision_date_from}
                onClick={() => shiftDate(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Input
                id="decision-date"
                type="date"
                min={metadata.decision_date_from}
                max={metadata.decision_date_to}
                value={date}
                className="h-10 min-w-0 bg-white text-sm"
                aria-describedby="date-help"
                aria-invalid={Boolean(dateError)}
                onInput={(event) => chooseDate(event.currentTarget.value)}
                onChange={(event) => chooseDate(event.currentTarget.value)}
              />
              <Button
                variant="outline"
                size="icon"
                className="size-10 shrink-0 bg-white"
                aria-label="Next decision day"
                disabled={date === metadata.decision_date_to}
                onClick={() => shiftDate(1)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            <p
              id="date-help"
              className={`mt-2 text-[11px] leading-relaxed ${dateError ? 'text-destructive' : 'text-neutral-500'}`}
            >
              {dateError ||
                `${scopePeriodLabel(metadata.decision_date_from, metadata.decision_date_to)} · decisions for next-day delivery`}
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-neutral-600">
              <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
              Delivery day
            </p>
            <p className="flex min-h-10 items-center text-base font-semibold tracking-tight sm:text-xl">
              {dateLabel(delivery.toISOString().slice(0, 10))}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              Next-day wind generation
            </p>
          </div>
          <div className="border-l bg-primary/[.025] p-4 sm:border-l-0 sm:p-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Clock3 className="size-3.5 text-primary" aria-hidden="true" />
                <p className="text-xs font-medium text-neutral-600">Forecast deadline</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="About the assumed buying deadline"
                      className="rounded-full text-neutral-400 hover:text-primary"
                    >
                      <Info className="size-3.5" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    The client’s deadline is not confirmed. This pilot uses the N2EX reference. In
                    January, GMT and UTC are the same.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="flex min-h-10 items-center text-sm font-semibold tracking-tight sm:text-base">
                {metadata.decision_cutoff_gmt} GMT on the buying day
              </p>
              <a
                href={metadata.cutoff_reference_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Assumed deadline · N2EX source
                <ArrowUpRight className="size-3" aria-hidden="true" />
              </a>
              <p className="mt-1 text-[11px] text-neutral-500">
                Times use UTC = UK time (GMT) in this pilot.
              </p>
            </div>
          </div>
        </div>
      </Card>
      <DecisionPanel
        key={date}
        date={date}
        metadata={metadata}
        refreshMetadata={refreshMetadata}
        history={history}
        retryHistory={retryHistory}
        {...actions}
      />
      <Methodology metadata={metadata} />
    </>
  );
}

function DecisionPanel({
  date,
  metadata,
  refreshMetadata,
  history,
  retryHistory,
  ...actions
}: {
  history: Resource<PriorAccuracy>;
  retryHistory: () => void;
  date: string;
  metadata: Metadata;
  refreshMetadata: () => void;
} & ReplayActions) {
  const { resource, reload } = useResource(date, loadDecision);
  if (resource.state === 'loading')
    return (
      <div className="mt-5">
        <LoadingPanel message={`Loading replay for ${dateLabel(date)}…`} />
      </div>
    );
  if (resource.state === 'error')
    return (
      <div className="mt-5">
        <ErrorPanel message={resource.error.message} retry={reload} />
      </div>
    );
  if (!sameAnalysis(resource.value.meta, metadataReference(metadata))) {
    return (
      <div className="mt-5">
        <AnalysisReferenceError refresh={refreshMetadata} />
      </div>
    );
  }
  return (
    <DecisionResults
      decision={resource.value}
      history={history}
      retryHistory={retryHistory}
      refreshMetadata={refreshMetadata}
      {...actions}
    />
  );
}

import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Info,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { loadDecision, loadPriorAccuracy, loadMetadata, sameAnalysis } from './api';
import type { Decision, PriorAccuracy, Metadata, MissingReason } from './api';
import { dateLabel, hourLabel, number, power, signed, timestampLabel } from './format';
import ReplayChart from './ReplayChart';
import { useResource } from './useResource';
import type { Resource } from './useResource';
import { revealDetails } from './selection';

const reasonText: Record<MissingReason, string> = {
  missing_forecast: 'No forecast acquired',
  no_eligible_forecast: 'No forecast available before cutoff',
  missing_actual_first_half: 'First actual half-hour missing',
  missing_actual_second_half: 'Second actual half-hour missing',
};

export function LoadingPanel({ message }: { message: string }) {
  return (
    <Card role="status" className="gap-4 p-6 shadow-none">
      <div className="flex items-center gap-3">
        <Loader2
          className="size-4 animate-spin text-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        <h2 className="text-sm font-medium">{message}</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Loading the forecast and reported wind generation.
      </p>
      <div aria-hidden="true" className="grid grid-cols-3 gap-4">
        <Skeleton className="h-18 rounded-sm" />
        <Skeleton className="h-18 rounded-sm" />
        <Skeleton className="h-18 rounded-sm" />
      </div>
    </Card>
  );
}

export function ErrorPanel({
  message,
  retry,
  label = 'Try again',
}: {
  message: string;
  retry: () => void;
  label?: string;
}) {
  return (
    <Alert variant="destructive" className="bg-white p-6">
      <TriangleAlert className="size-4" />
      <AlertTitle>We couldn’t load this view.</AlertTitle>
      <AlertDescription>
        <p className="mt-1 leading-relaxed">{message}</p>
        <Button variant="outline" className="mt-4 text-foreground" onClick={retry}>
          {label}
          <ArrowRight aria-hidden="true" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}

type ReplayActions = {
  decisionDate: string | null;
  onDecisionDateChange: (date: string) => void;
  selectedHour: number;
  onHourChange: (hour: number) => void;
  onReviewAccuracy: () => void;
  onInspect: (target: string) => void;
};

export default function DecisionReplay(actions: ReplayActions) {
  const { resource, reload } = useResource('metadata', loadMetadata);
  if (resource.state === 'loading') return <LoadingPanel message="Loading historical wind data…" />;
  if (resource.state === 'error')
    return <ErrorPanel message={resource.error.message} retry={reload} />;
  const metadata = resource.value;
  return (
    <ReplayWorkspace
      key={`${metadata.snapshot.content_sha256}:${metadata.decision_cutoff_gmt}`}
      metadata={metadata}
      refreshMetadata={reload}
      {...actions}
    />
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
      setDateError('Choose a buying date from 1 to 31 January 2026.');
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
              {dateError || 'January 2026 · decisions for next-day delivery'}
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
  if (
    resource.value.meta.snapshot_id !== metadata.snapshot.content_sha256 ||
    resource.value.meta.decision_cutoff_gmt !== metadata.decision_cutoff_gmt
  ) {
    return (
      <div className="mt-5">
        <ErrorPanel
          message="The snapshot or cutoff changed while this page was open. Refresh the analysis to use consistent data."
          retry={refreshMetadata}
          label="Refresh analysis"
        />
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

function DecisionResults({
  decision,
  onReviewAccuracy,
  onInspect,
  history,
  retryHistory,
  refreshMetadata,
  selectedHour: selected,
  onHourChange: setSelected,
}: {
  decision: Decision;
  history: Resource<PriorAccuracy>;
  retryHistory: () => void;
  refreshMetadata: () => void;
} & ReplayActions) {
  const [compare, setCompare] = useState(false);
  const detailsRef = useRef<HTMLElement>(null);
  const forecastRef = useRef<HTMLElement>(null);
  const inspectForecast = (index: number) => {
    setSelected(index);
    revealDetails(forecastRef.current);
  };
  const inspectHour = (index: number) => {
    setSelected(index);
    setCompare(true);
    requestAnimationFrame(() => revealDetails(detailsRef.current));
  };
  const { metrics, hours } = decision;
  const coverage = metrics.coverage;
  const countHours = (count: number) => `${count} ${count === 1 ? 'hour' : 'hours'}`;
  const daySummary =
    coverage.matched_hours === 0
      ? 'There is not enough information to compare this day.'
      : metrics.exact_hours === coverage.matched_hours
        ? 'The forecast and reported generation were equal in every compared hour.'
        : metrics.overforecast_hours === coverage.matched_hours
          ? 'The forecast was higher than reported generation in every compared hour.'
          : metrics.underforecast_hours === coverage.matched_hours
            ? 'The forecast was lower than reported generation in every compared hour.'
            : `The forecast was higher than reported generation in ${countHours(metrics.overforecast_hours)} and lower in ${countHours(metrics.underforecast_hours)}.${metrics.exact_hours > 0 ? ` It matched exactly in ${countHours(metrics.exact_hours)}.` : ''}`;
  return (
    <div className="mt-5 space-y-5">
      <p className="sr-only" role="status">
        Replay loaded for {dateLabel(decision.decision_date)}. {coverage.matched_hours} of{' '}
        {coverage.expected_hours} hours matched.
      </p>
      {compare && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                coverage.matched_hours === coverage.expected_hours
                  ? 'gap-1.5 border-primary/20 bg-primary/5 px-2.5 py-1 text-primary'
                  : 'gap-1.5 border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800'
              }
            >
              <CircleCheck className="size-3" aria-hidden="true" />
              {coverage.matched_hours} / {coverage.expected_hours} hours compared
            </Badge>
          </div>
          <span>Each compared hour has a forecast and both actual readings.</span>
        </div>
      )}
      {coverage.matched_hours < coverage.expected_hours && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <TriangleAlert className="size-4" />
          <AlertTitle>Some information is missing</AlertTitle>
          <AlertDescription className="text-amber-800">
            {coverage.matched_hours === 0
              ? 'No comparable hours for this decision. Accuracy metrics are unavailable.'
              : 'Some hours cannot be compared. Metrics use matched hours only.'}{' '}
            Missing values stay blank in the charts; see the hourly evidence for reasons.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
        <Card
          className="min-w-0 gap-0 overflow-hidden py-0 shadow-none"
          role="region"
          aria-labelledby="chart-title"
        >
          <CardHeader className="border-b p-5 sm:p-6">
            <p className="text-[10px] font-semibold tracking-[.14em] text-primary">
              01 · THE FORECAST YOU COULD USE
            </p>
            <h2 id="chart-title" className="text-lg font-semibold">
              Wind forecast for {dateLabel(decision.delivery_date)}
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              For each hour, the latest publication available by {timestampLabel(decision.cutoff)}{' '}
              UTC.
            </p>
          </CardHeader>
          {!compare && (
            <ForecastAnswer
              decision={decision}
              selected={selected}
              onSelect={setSelected}
              detailsRef={forecastRef}
            />
          )}
          {compare && (
            <HourInspector
              decision={decision}
              selected={selected}
              onSelect={setSelected}
              detailsRef={detailsRef}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 sm:px-6">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={compare}
              onClick={() => setCompare(!compare)}
            >
              {compare ? 'Hide actual generation' : 'Compare with actual generation'}
            </Button>
            <Button variant="link" size="sm" onClick={() => onInspect(hours[selected].target_time)}>
              Why this forecast?
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </Card>
        <HistoricalContext
          history={history}
          retry={retryHistory}
          refresh={refreshMetadata}
          decision={decision}
          onExplore={onReviewAccuracy}
        />
        <Card
          className="min-w-0 gap-0 py-0 shadow-none lg:col-start-1"
          role="region"
          aria-label="Hourly forecast chart"
        >
          <CardContent className="px-3 pt-5 pb-0 sm:px-5">
            <ReplayChart
              hours={hours}
              selected={selected}
              onSelect={setSelected}
              onInspect={compare ? inspectHour : inspectForecast}
              showActuals={compare}
            />
          </CardContent>
        </Card>
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        These national Elexon series may cover different groups of wind farms. The historical gap
        does not isolate model error or determine your purchase quantity.
      </p>
      <Accordion type="single" collapsible className="rounded-lg border bg-white px-5 sm:px-6">
        <AccordionItem value="day-review">
          <AccordionTrigger className="py-5 text-sm">
            Review this day after delivery
          </AccordionTrigger>
          <AccordionContent>
            <section
              className="rounded-lg border bg-white p-5 sm:p-6"
              aria-label="Buying day interpretation"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-[10px] font-semibold tracking-[.14em] text-primary">
                    LOOKING BACK AT THIS BUYING DAY
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">What did the wind assumption miss?</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{daySummary}</p>
                </div>
                <Badge variant="outline" className="rounded-sm">
                  Known after delivery
                </Badge>
              </div>
              <DailyMetrics decision={decision} />
            </section>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Accordion type="multiple" className="rounded-lg border bg-white px-5 sm:px-6">
        <AccordionItem value="metrics">
          <AccordionTrigger className="py-5 hover:no-underline">
            <span>
              <span className="block text-sm font-semibold">More accuracy measures</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Understand MAE, bias, RMSE and percentiles
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <MetricExplanations decision={decision} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="readings">
          <AccordionTrigger className="py-5 hover:no-underline">
            <span>
              <span className="block text-sm font-semibold">View all 24 hourly readings</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Forecast timing, actual readings & calculation details
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <Evidence decision={decision} selected={selected} onSelect={inspectHour} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function ForecastAnswer({
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

function HistoricalContext({
  history,
  retry,
  refresh,
  decision,
  onExplore,
}: {
  history: Resource<PriorAccuracy>;
  retry: () => void;
  refresh: () => void;
  decision: Decision;
  onExplore: () => void;
}) {
  return (
    <Card
      className="gap-0 overflow-hidden py-0 shadow-none lg:col-start-2 lg:row-start-1 lg:row-span-2"
      role="region"
      aria-label="Historical reliability"
    >
      <CardHeader className="border-b p-5 sm:p-6">
        <p className="text-[10px] font-semibold tracking-[.14em] text-primary">
          02 · THE HISTORICAL GAP
        </p>
        <h2 className="text-lg font-semibold">How close were the forecasts?</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Evidence available by {timestampLabel(decision.cutoff)} UTC
        </p>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        {history.state === 'loading' && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading historical accuracy…
          </p>
        )}
        {history.state === 'error' && (
          <div>
            <p className="text-sm text-muted-foreground">
              Historical accuracy could not be loaded. The buying-time forecast is still available.
            </p>
            <Button variant="outline" className="mt-3" onClick={retry}>
              Retry historical accuracy
            </Button>
          </div>
        )}
        {history.state === 'ready' &&
          (!sameAnalysis(history.value.meta, decision.meta) ? (
            <div>
              <p role="alert" className="text-sm text-destructive">
                The accuracy reference does not match this forecast. Reload the overview before
                comparing them.
              </p>
              <Button variant="outline" className="mt-3" onClick={refresh}>
                Refresh overview
              </Button>
            </div>
          ) : history.value.metrics.coverage.matched_hours === 0 ? (
            <div>
              <p className="text-base font-semibold">Insufficient earlier history</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {history.value.metrics.coverage.expected_hours === 0
                  ? 'No delivery hours in this snapshot had finished by this buying deadline.'
                  : 'No complete forecast and actual pairs were available by this buying deadline.'}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Later outcomes are excluded. Choose a later buying day to review the history
                available then.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Average hourly gap · MAE</p>
              <p className="mt-2 text-[32px] font-semibold tracking-tight tabular-nums">
                {power(history.value.metrics.mae_mw)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {history.value.metrics.mae_mw === null
                  ? 'There are no complete hourly comparisons in this period.'
                  : 'This is how far forecasts differed from reported generation on average, ignoring whether the forecast was high or low.'}
              </p>
              <div className="mt-5 border-t pt-4">
                <p className="text-sm font-medium">
                  {history.value.metrics.bias_mw === null
                    ? 'Average direction unavailable'
                    : history.value.metrics.bias_mw > 0
                      ? 'Forecasts were higher on average'
                      : history.value.metrics.bias_mw < 0
                        ? 'Forecasts were lower on average'
                        : 'High and low differences balanced on average'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {history.value.metrics.bias_mw === null
                    ? 'Complete comparisons are needed.'
                    : history.value.metrics.bias_mw === 0
                      ? 'Individual hours can still have large differences.'
                      : `${power(Math.abs(history.value.metrics.bias_mw))} ${history.value.metrics.bias_mw > 0 ? 'above' : 'below'} reported power, keeping the direction of each difference.`}
                </p>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                {history.value.metrics.coverage.matched_hours} /{' '}
                {history.value.metrics.coverage.expected_hours} hours compared · completed earlier
                hours
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Delivery window: {timestampLabel(history.value.delivery_start)}–
                {timestampLabel(history.value.delivery_end)} UTC
              </p>
              <p className="mt-3 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                Only completed hours with both actual readings published by this deadline. Earlier
                evidence is not a guaranteed future error range.
              </p>
            </>
          ))}
        <Button variant="outline" className="mt-5 w-full" onClick={onExplore}>
          Explore historical accuracy
          <ArrowRight aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}

function DailyMetrics({ decision }: { decision: Decision }) {
  const { metrics } = decision;
  const direction =
    metrics.bias_mw === null
      ? 'Unavailable'
      : metrics.bias_mw > 0
        ? 'Higher on average'
        : metrics.bias_mw < 0
          ? 'Lower on average'
          : 'No average direction';
  return (
    <div
      className="mt-5 grid gap-4 sm:grid-cols-2"
      role="region"
      aria-label="Daily accuracy metrics"
    >
      <article className="rounded-md border bg-neutral-50/50 p-5">
        <p className="text-[11px] font-medium text-primary">SIZE OF THE MISS · MAE</p>
        <h2 className="mt-2 min-h-10 text-sm font-semibold leading-5">
          How far off was the forecast?
        </h2>
        <p className="mt-4 text-[36px] font-semibold leading-none tracking-tight tabular-nums">
          {number(metrics.mae_mw)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">MW</span>
        </p>
        <p className="mt-2 text-xs font-medium text-primary">Average gap</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {metrics.mae_mw === null
            ? 'No complete hourly comparisons are available.'
            : 'Average size of the hourly differences, whether the forecast was high or low. Smaller means closer to actual.'}
        </p>
      </article>
      <article className="rounded-md border bg-neutral-50/50 p-5">
        <p className="text-[11px] font-medium text-actual">DIRECTION OF THE MISS · BIAS</p>
        <h2 className="mt-2 min-h-10 text-sm font-semibold leading-5">
          Was the forecast high or low?
        </h2>
        <p className="mt-4 text-[36px] font-semibold leading-none tracking-tight tabular-nums">
          {metrics.bias_mw === null ? '—' : number(Math.abs(metrics.bias_mw))}
          <span className="ml-2 text-sm font-normal text-muted-foreground">MW</span>
        </p>
        <p className="mt-2 text-xs font-medium text-actual">{direction}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {metrics.bias_mw === null
            ? 'No complete hourly comparisons are available.'
            : metrics.bias_mw === 0
              ? 'High and low differences balance on average. Individual hours may still differ.'
              : `The forecast was ${metrics.bias_mw > 0 ? 'higher' : 'lower'} by this amount on average. High and low differences can cancel each other out.`}
        </p>
      </article>
    </div>
  );
}

function HourInspector({
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

function MetricExplanations({ decision }: { decision: Decision }) {
  const { metrics } = decision;
  const measures = [
    {
      title: 'Average difference with direction (bias)',
      value: signed(metrics.bias_mw),
      text: 'Positive means the forecast was higher on average; negative means lower. Opposite differences can cancel out.',
    },
    {
      title: 'Measure that emphasizes large misses (RMSE)',
      value: number(metrics.rmse_mw),
      text: 'Root mean square error gives large differences more weight. Compare it with the average gap to understand the influence of large misses.',
    },
    {
      title: 'Middle-sized miss (P50)',
      value: number(metrics.p50_absolute_error_mw),
      text: 'The median: the middle of the observed error sizes after sorting them from smallest to largest.',
    },
    {
      title: 'Upper-range miss (P90)',
      value: number(metrics.p90_absolute_error_mw),
      text: 'The value 90% of the way through the sorted error sizes, with interpolation between observations. This describes past differences, not tomorrow’s uncertainty.',
    },
    {
      title: 'Largest hourly miss',
      value: number(metrics.max_absolute_error_mw),
      text: 'The biggest difference observed among the hours with complete data.',
    },
  ];
  return (
    <div className="text-sm leading-relaxed text-muted-foreground">
      <p>
        The average gap above is{' '}
        <strong className="font-medium text-foreground">MAE (mean absolute error)</strong>: take the
        size of each hourly difference, then average them. The average direction is{' '}
        <strong className="font-medium text-foreground">bias</strong>: keep the plus or minus signs
        before averaging.
      </p>
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {measures.map((measure) => (
          <div className="border-t py-4" key={measure.title}>
            <dt className="text-sm font-medium text-foreground">{measure.title}</dt>
            <dd className="mt-2">
              <strong className="text-xl font-semibold text-foreground tabular-nums">
                {measure.value}{' '}
                <span className="text-xs font-normal text-muted-foreground">MW</span>
              </strong>
              <p className="mt-2 text-xs leading-relaxed">{measure.text}</p>
            </dd>
          </div>
        ))}
      </dl>
      {metrics.coverage.matched_hours === 0 && (
        <p>No matched hours are available, so these measures cannot be calculated.</p>
      )}
    </div>
  );
}

function Evidence({
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

export function Methodology({ metadata }: { metadata: Metadata }) {
  return (
    <section id="data-sources" className="mt-8 scroll-mt-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold">Sources and assumptions</h2>
      </div>
      <Accordion type="multiple" className="rounded-lg border bg-white px-5 sm:px-6">
        <AccordionItem value="sources">
          <AccordionTrigger className="py-5">Where the numbers come from</AccordionTrigger>
          <AccordionContent className="space-y-4 text-sm leading-[1.85] text-muted-foreground">
            <p className="max-w-3xl">
              Elexon WINDFOR provides the expected wind power and when each forecast was published.
              Elexon FUELHH WIND provides the reported wind power for each half-hour. For each
              next-day hour, we use the latest forecast published by {metadata.decision_cutoff_gmt}{' '}
              GMT on the buying day and average both actual half-hour readings. The actual readings
              became available after the buying decision.
            </p>
            <div className="flex flex-wrap gap-3">
              {metadata.sources.map((source) => (
                <Button key={source.dataset} asChild variant="outline" size="sm">
                  <a href={source.documentation_url} target="_blank" rel="noreferrer">
                    Elexon {source.dataset}
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                </Button>
              ))}
            </div>
            <p className="text-xs">
              {number(metadata.snapshot.forecast_records, 0)} forecast versions ·{' '}
              {number(metadata.snapshot.outturn_half_hours, 0)} actual half-hours · Retrieved{' '}
              {timestampLabel(metadata.snapshot.retrieved_at)} UTC
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="limits">
          <AccordionTrigger className="py-5">
            Assumptions and limits of this comparison
          </AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
              {metadata.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

export function ProductGuide() {
  return (
    <section id="how-it-works" className="mt-8 scroll-mt-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold">A little context goes a long way.</h2>
      </div>
      <Accordion type="multiple" className="rounded-lg border bg-white px-5 sm:px-6">
        <AccordionItem value="help">
          <AccordionTrigger className="py-5">
            How does this help with a buying decision?
          </AccordionTrigger>
          <AccordionContent className="max-w-3xl text-sm leading-[1.85] text-muted-foreground">
            Your team needs a wind estimate before deciding what other electricity to buy. WindSight
            shows the latest forecast available at the decision deadline, then measures its
            historical difference from reported generation. Use that evidence to assess the wind
            assumption in your plan. Customer demand, existing contracts and the renewable supply
            available to your utility are also needed to calculate a purchase quantity. This pilot
            replays January 2026; it does not supply live trading instructions.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="terms">
          <AccordionTrigger className="py-5">
            What do forecast, actual, MW and deadline mean?
          </AccordionTrigger>
          <AccordionContent>
            <dl className="grid gap-4 text-xs leading-relaxed sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Forecast</dt>
                <dd className="mt-1 text-muted-foreground">
                  The wind power expected for a delivery hour, using a version published before the
                  buying deadline.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Actual</dt>
                <dd className="mt-1 text-muted-foreground">
                  The wind power reported after delivery. We average the two half-hour readings for
                  each hour.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">MW · megawatts</dt>
                <dd className="mt-1 text-muted-foreground">
                  A measure of power. Higher MW means more electricity generated at that time; it is
                  not an energy total for the day.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Decision deadline · cutoff</dt>
                <dd className="mt-1 text-muted-foreground">
                  Only forecasts published by this time on the buying day can be used in the replay.
                  The assumed time is shown beside the buying date when historical data is
                  available.
                </dd>
              </div>
            </dl>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

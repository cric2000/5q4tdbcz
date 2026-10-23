import { useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Info } from 'lucide-react';
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
import {
  loadAccuracyRange,
  loadEvolution,
  loadMetadata,
  metadataReference,
  sameAnalysis,
} from './api';
import type { Accuracy, DailyAccuracy, Evolution, Metadata } from './api';
import { ErrorPanel, LoadingPanel, Methodology } from './DecisionReplay';
import { DailyTrend, ErrorDistribution, PublicationTimeline } from './AnalysisCharts';
import { dateLabel, hourLabel, number, power, signed, timestampLabel } from './format';
import { useResource } from './useResource';

export type AnalysisView = 'replay' | 'accuracy' | 'evolution';
export const analysisViews: {
  value: AnalysisView;
  label: string;
  heading: string;
  description: string;
}[] = [
  {
    value: 'replay',
    label: 'Decision replay',
    heading: 'Replay a buying day',
    description: 'Start with a date. We’ll show you what was known and what followed.',
  },
  {
    value: 'accuracy',
    label: 'Accuracy & risk',
    heading: 'How reliable were the wind forecasts?',
    description:
      'Review past differences across buying days, then investigate the hours with the largest gaps.',
  },
  {
    value: 'evolution',
    label: 'Forecast evolution',
    heading: 'What changed before the buying deadline?',
    description:
      'Follow the published forecasts for one delivery hour. Separate what was known then from what arrived later.',
  },
];

const inconsistent =
  'The snapshot or cutoff changed while this page was open. Refresh the analysis to use consistent data.';
function ReferenceError({ refresh }: { refresh: () => void }) {
  return <ErrorPanel message={inconsistent} retry={refresh} label="Refresh analysis" />;
}
function EvidencePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Accordion type="multiple" className="rounded-sm border bg-white px-5 sm:px-6">
      <AccordionItem value="evidence">
        <AccordionTrigger className="py-5 text-sm">{title}</AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
function Statistic({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3 p-5 shadow-none sm:p-6">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </Card>
  );
}
function Boundaries() {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        These are historical differences between national Elexon series, which may cover different
        groups of wind farms. They are not a guaranteed error range or a purchase recommendation.
        Demand, existing contracts and your utility’s own supply are also needed to plan a purchase.
      </span>
    </p>
  );
}

export default function SecondaryAnalysis({
  view,
  initialTarget,
  onInspect,
}: {
  view: 'accuracy' | 'evolution';
  initialTarget: string | null;
  onInspect: (target: string) => void;
}) {
  const { resource, reload } = useResource('metadata', loadMetadata);
  if (resource.state === 'loading') return <LoadingPanel message="Loading historical wind data…" />;
  if (resource.state === 'error')
    return <ErrorPanel message={resource.error.message} retry={reload} />;
  const metadata = resource.value;
  return (
    <div key={`${view}:${metadata.snapshot.content_sha256}:${metadata.decision_cutoff_gmt}`}>
      {view === 'accuracy' ? (
        <AccuracyWorkspace metadata={metadata} refresh={reload} onInspect={onInspect} />
      ) : (
        <EvolutionWorkspace
          key={initialTarget ?? 'default'}
          metadata={metadata}
          refresh={reload}
          initialTarget={initialTarget}
        />
      )}
      <Methodology metadata={metadata} />
    </div>
  );
}

function AccuracyWorkspace({
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
      <Card className="gap-4 p-5 shadow-none sm:p-6">
        <form
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
                'Choose buying dates within January 2026, with the start on or before the end.',
              );
              return;
            }
            setError('');
            setRange(`${from}|${to}`);
          }}
          noValidate
          className="flex flex-wrap items-end gap-4"
          aria-label="Accuracy date range"
        >
          <div>
            <label htmlFor="accuracy-from" className="mb-2 block text-xs font-medium">
              First buying day
            </label>
            <Input
              id="accuracy-from"
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
          <Button type="submit" className="h-9">
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
          <ReferenceError refresh={refresh} />
        ))}
    </div>
  );
}

function AccuracyResults({
  overall,
  daily,
  onInspect,
}: {
  overall: Accuracy;
  daily: DailyAccuracy;
  onInspect: (target: string) => void;
}) {
  const { metrics, error_histogram: bins } = overall;
  const coverage = metrics.coverage;
  const bias = metrics.bias_mw;
  return (
    <div className="space-y-5" aria-label="Accuracy results" role="region">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-relaxed">
        <p role="status">
          Analysis for{' '}
          <strong>
            {dateLabel(overall.decision_date_from)}–{dateLabel(overall.decision_date_to)}
          </strong>{' '}
          · Buying days
        </p>
        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
          {number(coverage.matched_hours, 0)} / {number(coverage.expected_hours, 0)} hours compared
        </Badge>
      </div>
      {coverage.matched_hours < coverage.expected_hours && (
        <Alert>
          <Info />
          <AlertTitle>
            {coverage.matched_hours
              ? 'Some hours could not be compared.'
              : 'No complete hourly comparisons.'}
          </AlertTitle>
          <AlertDescription>
            Missing readings are excluded from the statistics. Coverage is{' '}
            {number(coverage.coverage_percent)}% of the expected delivery hours.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Statistic title="Average gap (MAE)" value={power(metrics.mae_mw)}>
          The average size of an hourly difference, ignoring direction. Smaller means the forecast
          was closer to actual power.
        </Statistic>
        <Statistic
          title={
            bias === null
              ? 'Average direction (bias)'
              : bias === 0
                ? 'High and low balanced on average'
                : `Forecast ${bias > 0 ? 'higher' : 'lower'} on average`
          }
          value={bias === null ? 'Unavailable' : power(Math.abs(bias))}
        >
          Bias keeps the direction of each difference. High and low differences can cancel out, even
          when individual misses are large.
        </Statistic>
        <Statistic title="Larger observed gaps (P90)" value={power(metrics.p90_absolute_error_mw)}>
          The 90th percentile of past hourly gap sizes, using interpolation. Helps you see larger
          historical misses; it is not a promise about tomorrow.
        </Statistic>
      </div>
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="p-5 sm:p-6">
          <h3 className="text-lg font-semibold">Was the forecast more often high or low?</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            A high forecast means less wind was reported than expected. A low forecast means more
            wind was reported.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 pb-6 sm:grid-cols-3">
          {[
            ['Forecast too high', metrics.overforecast_hours, metrics.overforecast_percent],
            ['Forecast too low', metrics.underforecast_hours, metrics.underforecast_percent],
            ['Exactly matched', metrics.exact_hours, metrics.exact_percent],
          ].map(([label, count, percent]) => (
            <div key={String(label)} className="border-l-2 border-primary/30 pl-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {number(count as number, 0)} hours{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({percent === null ? 'unavailable' : number(percent as number) + '%'})
                </span>
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="min-w-0 gap-0 shadow-none">
          <CardHeader>
            <h3 className="text-lg font-semibold">When were the forecasts further off?</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Compare daily average gaps. Use the daily readings below to check coverage before
              comparing days.
            </p>
          </CardHeader>
          <CardContent className="pt-3">
            <DailyTrend days={daily.days} />
          </CardContent>
        </Card>
        <Card className="min-w-0 gap-0 shadow-none">
          <CardHeader>
            <h3 className="text-lg font-semibold">How were the hourly differences spread?</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Taller bars mean more hours in that interval. Zero means forecast and actual power
              matched.
            </p>
          </CardHeader>
          <CardContent className="pt-3">
            <ErrorDistribution bins={bins} />
          </CardContent>
        </Card>
      </div>
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <h3 className="text-lg font-semibold">Hours worth a closer look</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The ten largest gaps in this range, ranked by size. Open a publication history to see
            what was available before the buying decision.
          </p>
        </CardHeader>
        <CardContent>
          {overall.worst_hours.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matched hours to rank.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-xs">
                <caption className="sr-only">Largest hourly forecast differences</caption>
                <thead className="border-b text-muted-foreground">
                  <tr>
                    {[
                      'Delivery hour · UTC',
                      'Forecast',
                      'Actual',
                      'Forecast − actual',
                      'Investigate',
                    ].map((heading) => (
                      <th key={heading} className="px-3 py-3 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overall.worst_hours.map((hour) => (
                    <tr key={hour.target_time} className="border-b last:border-0">
                      <th scope="row" className="px-3 py-3 font-medium">
                        {timestampLabel(hour.target_time)}
                      </th>
                      <td className="px-3 py-3 tabular-nums">{power(hour.forecast_mw)}</td>
                      <td className="px-3 py-3 tabular-nums">{power(hour.actual_mw)}</td>
                      <td className="px-3 py-3 tabular-nums">{signed(hour.error_mw)} MW</td>
                      <td className="px-3 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onInspect(hour.target_time)}
                          aria-label={`Inspect forecasts for ${timestampLabel(hour.target_time)} UTC`}
                        >
                          See history
                          <ArrowUpRight aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <EvidencePanel title="Daily readings and coverage">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] text-left text-xs">
            <caption className="sr-only">Daily accuracy readings</caption>
            <thead className="border-b text-muted-foreground">
              <tr>
                {[
                  'Buying day',
                  'Delivery day',
                  'Compared hours',
                  'Average gap · MW',
                  'Bias · MW',
                  'P90 gap · MW',
                ].map((label) => (
                  <th key={label} className="px-3 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.days.map((day) => (
                <tr key={day.decision_date} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-3 font-medium">
                    {dateLabel(day.decision_date)}
                  </th>
                  <td className="px-3 py-3">{dateLabel(day.delivery_date)}</td>
                  <td className="px-3 py-3">{day.metrics.coverage.matched_hours} / 24</td>
                  <td className="px-3 py-3">{number(day.metrics.mae_mw)}</td>
                  <td className="px-3 py-3">{signed(day.metrics.bias_mw)}</td>
                  <td className="px-3 py-3">{number(day.metrics.p90_absolute_error_mw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EvidencePanel>
      <EvidencePanel title="More measures and distribution readings">
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <p>
            RMSE: <strong>{power(metrics.rmse_mw)}</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              Gives larger misses extra weight.
            </span>
          </p>
          <p>
            Middle gap (P50): <strong>{power(metrics.p50_absolute_error_mw)}</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              The middle of the sorted gap sizes.
            </span>
          </p>
          <p>
            Largest gap: <strong>{power(metrics.max_absolute_error_mw)}</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              The largest single-hour difference.
            </span>
          </p>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Statistics use matched hours across the whole range, rather than averaging daily averages.
          Signed error is forecast minus actual. Interval lower bounds are included; only the final
          upper bound is included.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <caption className="sr-only">Signed error distribution intervals</caption>
            <thead className="border-b">
              <tr>
                <th className="p-3">From · MW (included)</th>
                <th className="p-3">To · MW</th>
                <th className="p-3">Hours</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((bin, index) => (
                <tr key={index} className="border-b last:border-0">
                  <td className="p-3">{signed(bin.lower_mw)}</td>
                  <td className="p-3">
                    {signed(bin.upper_mw)} ({bin.upper_inclusive ? 'included' : 'excluded'})
                  </td>
                  <td className="p-3">{bin.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EvidencePanel>
      <Boundaries />
    </div>
  );
}

function EvolutionWorkspace({
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
      setDateError('Choose a delivery day from 2 January to 1 February 2026.');
      return;
    }
    setTarget(date + target.slice(10));
    setDateError('');
  };
  return (
    <div className="space-y-5">
      <Card className="gap-4 p-5 shadow-none sm:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="evolution-date" className="mb-2 block text-xs font-medium">
              Delivery day
            </label>
            <Input
              id="evolution-date"
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
              className="h-9 rounded-sm border border-input bg-white px-3 text-sm"
              value={target.slice(11, 13)}
              onChange={(e) => setTarget(`${target.slice(0, 10)}T${e.target.value}:00:00Z`)}
            >
              {Array.from({ length: 24 }, (_, index) => (
                <option key={index} value={String(index).padStart(2, '0')}>
                  {String(index).padStart(2, '0')}:00–{String((index + 1) % 24).padStart(2, '0')}:00
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
          <ReferenceError refresh={refresh} />
        ))}
    </div>
  );
}

function EvolutionResults({ evolution }: { evolution: Evolution }) {
  const rows = evolution.publications;
  const chosenIndex = rows.findIndex((row) => row.selected_as_of);
  const [selected, setSelected] = useState(Math.max(0, chosenIndex));
  const row = rows[selected];
  const comparison = evolution.comparison;
  const before = rows.filter((publication) => publication.available_at_cutoff).length;
  const changed = rows.filter(
    (publication) => publication.value_changed_from_previous === true,
  ).length;
  return (
    <div className="space-y-5" aria-label="Forecast evolution results" role="region">
      <p role="status" className="text-xs leading-relaxed">
        History for{' '}
        <strong>
          {dateLabel(evolution.delivery_date)}, {hourLabel(comparison.target_time)} UTC
        </strong>{' '}
        · Buying day: {dateLabel(evolution.decision_date)}
      </p>
      <Alert role="note" className="border-primary/15 bg-primary/5">
        <Info />
        <AlertTitle>What the buyer could use</AlertTitle>
        <AlertDescription className="mt-2 block leading-relaxed">
          {chosenIndex < 0 ? (
            'No stored forecast was published by the buying deadline for this hour.'
          ) : (
            <>
              The latest available forecast was <strong>{power(comparison.forecast_mw)}</strong>,
              published {timestampLabel(comparison.forecast_published_at)} UTC.
            </>
          )}{' '}
          The assumed deadline was {timestampLabel(evolution.cutoff)} UTC. Later publications are
          shown for review and are excluded from the original buying decision. The client’s deadline
          is to be confirmed.
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 md:grid-cols-3">
        <Statistic title="Forecast at the buying deadline" value={power(comparison.forecast_mw)}>
          Latest publication at or before the deadline, including a publication exactly at the
          deadline.
        </Statistic>
        <Statistic title="Reported after delivery" value={power(comparison.actual_mw)}>
          The average of both reported half-hour readings. This was not known when the buying
          decision was made.
        </Statistic>
        <Statistic
          title="Forecast minus actual"
          value={comparison.error_mw === null ? 'Unavailable' : `${signed(comparison.error_mw)} MW`}
        >
          {comparison.error_mw === null
            ? 'Both a forecast and complete actual readings are needed.'
            : comparison.error_mw === 0
              ? 'The forecast matched reported wind power.'
              : `Reported wind power was ${power(Math.abs(comparison.error_mw))} ${comparison.error_mw > 0 ? 'lower' : 'higher'} than forecast.`}
        </Statistic>
      </div>
      <Card className="min-w-0 gap-4 shadow-none">
        <CardHeader>
          <h3 className="text-lg font-semibold">How the published forecast changed</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each point is a stored publication, spaced by its actual publication time. Select a
            point or use the publication controls below. A repeated value is a republication, not
            evidence of a new model run.
          </p>
          <p className="text-xs text-muted-foreground">
            {rows.length} publications · {before} available by the deadline · {rows.length - before}{' '}
            later · {changed} changes in value
          </p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              No publications were acquired for this delivery hour.
            </p>
          ) : (
            <PublicationTimeline evolution={evolution} selected={selected} onSelect={setSelected} />
          )}
          {row && (
            <section className="mt-5 border-t pt-5" aria-label="Selected publication details">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Selected publication · {selected + 1} of {rows.length}
                  </p>
                  <h4 className="mt-1 text-base font-semibold">
                    {timestampLabel(row.publish_time)} UTC
                  </h4>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10"
                    aria-label="Previous publication"
                    disabled={selected === 0}
                    onClick={() => setSelected(selected - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10"
                    aria-label="Next publication"
                    disabled={selected === rows.length - 1}
                    onClick={() => setSelected(selected + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-2xl font-semibold text-primary tabular-nums">
                  {power(row.generation_mw)}
                </p>
                <Badge variant={row.selected_as_of ? 'default' : 'secondary'}>
                  {row.selected_as_of
                    ? 'Used for the buying decision'
                    : row.available_at_cutoff
                      ? 'Available before the deadline'
                      : 'After the deadline · excluded'}
                </Badge>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {row.value_changed_from_previous === null
                  ? 'First publication in the acquired history; no earlier stored value to compare.'
                  : row.value_changed_from_previous
                    ? `Value changed by ${signed(row.generation_mw - rows[selected - 1].generation_mw)} MW from the previous stored publication.`
                    : 'Same value as the previous stored publication. A later publication time does not establish a new forecasting model run.'}
              </p>
            </section>
          )}
        </CardContent>
      </Card>
      <EvidencePanel title="All publications and deadline eligibility">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[670px] text-left text-xs">
            <caption className="sr-only">Forecast publication history</caption>
            <thead className="border-b text-muted-foreground">
              <tr>
                {[
                  'Publication · UTC',
                  'Forecast · MW',
                  'Available by deadline?',
                  'Value vs previous',
                  'Inspect',
                ].map((label) => (
                  <th key={label} className="px-3 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((publication, index) => (
                <tr
                  key={publication.publish_time}
                  className={`border-b last:border-0 ${selected === index ? 'bg-primary/5' : ''}`}
                >
                  <th scope="row" className="px-3 py-3 font-medium">
                    {timestampLabel(publication.publish_time)}
                    {publication.selected_as_of && (
                      <span className="mt-1 block text-primary">Used for buying decision</span>
                    )}
                  </th>
                  <td className="px-3 py-3 tabular-nums">{number(publication.generation_mw)}</td>
                  <td className="px-3 py-3">
                    {publication.available_at_cutoff ? 'Yes' : 'No · later'}
                  </td>
                  <td className="px-3 py-3">
                    {publication.value_changed_from_previous === null
                      ? 'First stored value'
                      : publication.value_changed_from_previous
                        ? 'Changed'
                        : 'Unchanged'}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Inspect stored publication ${timestampLabel(publication.publish_time)} UTC`}
                      aria-pressed={selected === index}
                      onClick={() => setSelected(index)}
                    >
                      Inspect
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EvidencePanel>
      <p className="text-xs leading-relaxed text-muted-foreground">
        This is the publication history contained in the prepared snapshot. It does not prove when a
        forecasting model was run, and it may not contain every upstream revision.
      </p>
      <Boundaries />
    </div>
  );
}

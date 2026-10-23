import type { Accuracy, DailyAccuracy } from '@/api';
import { Boundaries, EvidencePanel, Statistic } from '@/components/analysis/AnalysisPrimitives';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DailyTrend, ErrorDistribution } from '@/features/accuracy/AccuracyCharts';
import { dateRangeLabel } from '@/lib/dates';
import { dateLabel, number, power, signed, timestampLabel } from '@/lib/format';
import { averageGapNote, supplyImplication } from '@/lib/interpretation';
import { ArrowUpRight, Info } from 'lucide-react';

export function AccuracyResults({
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
          Buying days reviewed:{' '}
          <strong>{dateRangeLabel(overall.decision_date_from, overall.decision_date_to)}</strong>
          <span className="mt-1 block text-muted-foreground">
            Delivery days:{' '}
            {dateRangeLabel(daily.days[0].delivery_date, daily.days.at(-1)!.delivery_date)} ·
            next-day generation
          </span>
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
      <div
        className="grid items-start gap-5 rounded-lg border border-primary/15 bg-primary/[.035] p-5 lg:grid-cols-[240px_minmax(0,1fr)] sm:p-6"
        role="note"
        aria-label="How to use this accuracy review"
      >
        <div>
          <p className="text-[10px] font-semibold tracking-[.14em] text-primary">
            WHAT THIS PERIOD TELLS YOU
          </p>
          <h3 className="mt-2 text-lg font-semibold leading-snug">
            {bias === null
              ? 'Not enough evidence to assess the wind assumption'
              : bias > 0
                ? 'Less wind than forecast on average'
                : bias < 0
                  ? 'More wind than forecast on average'
                  : metrics.mae_mw === 0
                    ? 'Wind matched the forecasts'
                    : 'Average direction hides hourly misses'}
          </h3>
        </div>
        <div className="text-sm leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            {supplyImplication(bias) ??
              (bias === null
                ? 'There is not enough complete data to assess this period.'
                : metrics.mae_mw === 0
                  ? 'No wind forecast gap was observed in the compared hours. Purchase planning still needs demand and existing supply.'
                  : 'High and low differences balanced on average; individual hours could still leave more or less demand to cover from other sources.')}
          </p>
          <p className="mt-2">
            Known after delivery: this review includes later outcomes across the selected period. To
            see only evidence available at a particular buying deadline, return to the buying
            overview. These national figures describe past misses; they do not calculate your
            purchase quantity or predict tomorrow’s error.
          </p>
        </div>
      </div>
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
          {averageGapNote(metrics) && <span className="mt-2 block">{averageGapNote(metrics)}</span>}
        </Statistic>
        <Statistic title="Larger observed gaps (P90)" value={power(metrics.p90_absolute_error_mw)}>
          About 9 in 10 past hourly gaps were this size or smaller. Calculated as the interpolated
          90th percentile. This shows larger past misses, not a guaranteed range for tomorrow.
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
        {coverage.matched_hours > 0 && (
          <div
            className="mx-6 mb-5 flex h-2.5 overflow-hidden rounded-sm bg-muted"
            role="img"
            aria-label={`Direction of matched hourly differences: ${metrics.overforecast_hours} forecast high, ${metrics.underforecast_hours} forecast low, ${metrics.exact_hours} exact`}
          >
            <span
              className="bg-primary"
              style={{ width: `${metrics.overforecast_percent ?? 0}%` }}
            />
            <span
              className="bg-actual"
              style={{ width: `${metrics.underforecast_percent ?? 0}%` }}
            />
            <span className="bg-neutral-300" style={{ width: `${metrics.exact_percent ?? 0}%` }} />
          </div>
        )}
        <CardContent className="grid gap-4 pb-6 sm:grid-cols-3">
          {[
            ['Forecast too high', metrics.overforecast_hours, metrics.overforecast_percent],
            ['Forecast too low', metrics.underforecast_hours, metrics.underforecast_percent],
            ['Exactly matched', metrics.exact_hours, metrics.exact_percent],
          ].map(([label, count, percent]) => (
            <div
              key={String(label)}
              className={`border-l-2 pl-4 ${label === 'Forecast too high' ? 'border-primary' : label === 'Forecast too low' ? 'border-actual' : 'border-neutral-300'}`}
            >
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
      <div className="grid items-stretch gap-6 xl:grid-cols-2">
        <Card className="min-w-0 gap-0 rounded-lg shadow-none">
          <CardHeader className="xl:min-h-28">
            <h3 className="text-lg font-semibold">When were the forecasts further off?</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Higher points mean less accurate next-day wind assumptions. Dates are buying days;
              each point scores the following day’s delivery. Check coverage in the daily readings.
            </p>
          </CardHeader>
          <CardContent className="pt-3">
            <DailyTrend days={daily.days} />
          </CardContent>
        </Card>
        <Card className="min-w-0 gap-0 rounded-lg shadow-none">
          <CardHeader className="xl:min-h-28">
            <h3 className="text-lg font-semibold">How were the hourly differences spread?</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Taller bars mean more hours with that size of miss. Positive means less wind than
              forecast; negative means more wind. Zero means forecast and actual power matched.
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
            The ten largest wind surprises, ranked by size. Less wind could leave more demand to
            cover from other sources; more wind could mean other supply needs were overestimated.
            See history to check the forecast available at the original deadline.
          </p>
        </CardHeader>
        <CardContent>
          {overall.worst_hours.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matched hours to rank.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-center text-xs [&_th]:text-center">
                <caption className="sr-only">Largest hourly forecast differences</caption>
                <thead className="border-b text-muted-foreground">
                  <tr>
                    {[
                      'Delivery hour · UTC',
                      'Forecast',
                      'Actual',
                      'Wind vs forecast',
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
                      <td className="px-3 py-3 tabular-nums">
                        {hour.error_mw === null
                          ? 'Unavailable'
                          : hour.error_mw === 0
                            ? 'Matched'
                            : `${power(Math.abs(hour.error_mw))} ${hour.error_mw > 0 ? 'less wind' : 'more wind'}`}
                      </td>
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
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Each buying day is paired with next-day delivery. Positive bias means wind was below
          forecast on average; negative means above it. MAE measures miss size and P90 shows larger
          past misses. Only compared hours contribute to the figures.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] text-center text-xs [&_th]:text-center">
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
                  <td className="px-3 py-3 tabular-nums">
                    {day.metrics.coverage.matched_hours} / 24
                  </td>
                  <td className="px-3 py-3 tabular-nums">{number(day.metrics.mae_mw)}</td>
                  <td className="px-3 py-3 tabular-nums">{signed(day.metrics.bias_mw)}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {number(day.metrics.p90_absolute_error_mw)}
                  </td>
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
          <table className="w-full min-w-[420px] text-center text-xs [&_th]:text-center">
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

import type { Accuracy, DailyAccuracy } from '@/api';
import { Boundaries, EvidencePanel, Statistic } from '@/components/analysis/AnalysisPrimitives';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DailyTrend, ErrorDistribution } from '@/features/accuracy/AccuracyCharts';
import { dateLabel, number, power, signed, timestampLabel } from '@/lib/format';
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
      <div
        className="grid items-start gap-5 rounded-lg border border-primary/15 bg-primary/[.035] p-5 lg:grid-cols-[240px_minmax(0,1fr)] sm:p-6"
        role="note"
        aria-label="How to use this accuracy review"
      >
        <div>
          <p className="text-[10px] font-semibold tracking-[.14em] text-primary">
            READ THE HISTORY IN THREE PARTS
          </p>
          <h3 className="mt-2 text-lg font-semibold leading-snug">
            Size. Direction. Larger misses.
          </h3>
        </div>
        <div className="text-sm leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            {bias === null
              ? 'There is not enough complete data to assess this period.'
              : bias > 0
                ? 'Forecasts tended to assume more wind than was later reported.'
                : bias < 0
                  ? 'Forecasts tended to assume less wind than was later reported.'
                  : 'High and low differences balanced on average; individual misses may still be large.'}
          </p>
          <p className="mt-2">
            This is a retrospective review of the selected period, including outcomes after earlier
            buying decisions. The buying overview separately limits accuracy to evidence available
            at its selected deadline. Use the figures below to review the wind assumption. Then
            inspect the largest gaps to see the forecast available at the time. These national
            series alone do not determine your purchase volume.
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
              Compare daily average gaps. Use the daily readings below to check coverage before
              comparing days.
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
                    ].map((heading, index) => (
                      <th
                        key={heading}
                        className={`px-3 py-3 font-medium ${index > 0 && index < 4 ? 'text-right' : ''}`}
                      >
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
                      <td className="px-3 py-3 text-right tabular-nums">
                        {power(hour.forecast_mw)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{power(hour.actual_mw)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {signed(hour.error_mw)} MW
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
                ].map((label, index) => (
                  <th
                    key={label}
                    className={`px-3 py-3 font-medium ${index >= 2 ? 'text-right' : ''}`}
                  >
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
                  <td className="px-3 py-3 text-right tabular-nums">
                    {day.metrics.coverage.matched_hours} / 24
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {number(day.metrics.mae_mw)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {signed(day.metrics.bias_mw)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
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

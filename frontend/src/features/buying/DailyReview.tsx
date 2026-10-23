import type { Decision } from '@/api';
import { Badge } from '@/components/ui/badge';
import { dateLabel, number, power, signed } from '@/lib/format';
import { averageGapNote, supplyImplication } from '@/lib/interpretation';

export function DailyReview({ decision }: { decision: Decision }) {
  const { metrics } = decision;
  const { matched_hours: compared, expected_hours: expected } = metrics.coverage;
  const summary =
    compared === 0
      ? 'There is not enough information to review this day.'
      : metrics.exact_hours === compared
        ? `Wind generation matched the forecast in all ${compared} compared hours.`
        : metrics.overforecast_hours > metrics.underforecast_hours
          ? `Wind delivered less power than forecast in ${metrics.overforecast_hours} of ${compared} compared hours.`
          : metrics.underforecast_hours > metrics.overforecast_hours
            ? `Wind delivered more power than forecast in ${metrics.underforecast_hours} of ${compared} compared hours.`
            : `Wind was below forecast in ${metrics.overforecast_hours} compared hours and above it in ${metrics.underforecast_hours}.`;
  const implication =
    compared === 0 || metrics.bias_mw === null
      ? null
      : (supplyImplication(metrics.bias_mw) ??
        (metrics.exact_hours === compared
          ? 'There was no wind forecast gap in these comparisons. Your purchase requirement still depends on demand and existing supply.'
          : 'High and low differences balanced on average, but individual hours could still leave more or less demand to cover from other sources.'));

  return (
    <section aria-label="Buying day interpretation">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[10px] font-semibold tracking-[.14em] text-primary">
            LOOKING BACK AT THIS BUYING DAY
          </p>
          <h3 className="mt-2 text-lg font-semibold">{summary}</h3>
          {compared > 0 && metrics.bias_mw !== null && metrics.bias_mw !== 0 && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Wind generation was <strong>{power(Math.abs(metrics.bias_mw))}</strong>{' '}
              {metrics.bias_mw > 0 ? 'below' : 'above'} forecast on average, after high and low
              differences offset each other.
            </p>
          )}
        </div>
        <Badge variant="outline" className="rounded-sm">
          Known after delivery
        </Badge>
      </div>
      {implication && (
        <div className="mt-4 rounded-md bg-primary/5 p-4">
          <p className="text-sm font-medium">What this meant for your buying plan</p>
          <p className="mt-1 text-sm leading-relaxed">{implication}</p>
          {metrics.exact_hours !== compared && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Your purchase quantity also depends on customer demand and existing supply; these
              national wind figures alone cannot calculate it.
            </p>
          )}
        </div>
      )}
      {compared < expected && (
        <p className="mt-3 text-xs text-muted-foreground">
          Only {compared} of {expected} delivery hours could be compared. Missing hours are
          excluded.
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        This reviews delivery on {dateLabel(decision.delivery_date)}. These outcomes were not
        available for the {dateLabel(decision.decision_date)} buying decision.
      </p>
      <DailyMetrics decision={decision} />
    </section>
  );
}

export function DailyMetrics({ decision }: { decision: Decision }) {
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
        <h4 className="mt-2 min-h-10 text-sm font-semibold leading-5">
          How far off was the forecast?
        </h4>
        <p className="mt-4 text-[36px] font-semibold leading-none tracking-tight tabular-nums">
          {number(metrics.mae_mw)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">MW</span>
        </p>
        <p className="mt-2 text-xs font-medium text-primary">Average gap</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {metrics.mae_mw === null
            ? 'No complete hourly comparisons are available.'
            : 'The average hourly miss, ignoring direction. Overestimates and underestimates do not cancel out. Smaller means closer to actual.'}
        </p>
      </article>
      <article className="rounded-md border bg-neutral-50/50 p-5">
        <p className="text-[11px] font-medium text-actual">DIRECTION OF THE MISS · BIAS</p>
        <h4 className="mt-2 min-h-10 text-sm font-semibold leading-5">
          Was the forecast high or low?
        </h4>
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
              : `Wind generation was ${metrics.bias_mw > 0 ? 'below' : 'above'} forecast by this amount on average, after overestimates and underestimates offset each other.`}
        </p>
      </article>
      {averageGapNote(metrics) && (
        <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
          {averageGapNote(metrics)}
        </p>
      )}
    </div>
  );
}

export function MetricExplanations({ decision }: { decision: Decision }) {
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

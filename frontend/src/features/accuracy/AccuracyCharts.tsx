import type { DailyMetric, HistogramBin } from '@/api';
import { usePlot } from '@/hooks/usePlot';
import { dateLabel, number, power, signed } from '@/lib/format';
import { useId } from 'react';

export function DailyTrend({ days }: { days: DailyMetric[] }) {
  const id = useId();
  const p = usePlot(true);
  const start = Date.parse(days[0].decision_date + 'T00:00:00Z');
  const end = Date.parse(days.at(-1)!.decision_date + 'T00:00:00Z');
  const span = end - start || 86400000;
  const x = (date: string) =>
    p.left +
    (end === start
      ? p.plotWidth / 2
      : ((Date.parse(date + 'T00:00:00Z') - start) / span) * p.plotWidth);
  const max = Math.max(100, ...days.map((day) => day.metrics.mae_mw ?? 0)) * 1.15;
  const y = (value: number) => p.top + (1 - value / max) * p.plotHeight;
  let connected = false;
  const path = days
    .map((day) => {
      if (day.metrics.mae_mw === null) {
        connected = false;
        return '';
      }
      const command = connected ? 'L' : 'M';
      connected = true;
      return `${command}${x(day.decision_date)},${y(day.metrics.mae_mw)}`;
    })
    .join(' ');
  const tickIndexes = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  return (
    <figure>
      <svg
        className={`analysis-chart ${p.compact ? 'compact-chart' : ''}`}
        viewBox={`0 0 ${p.width} ${p.height}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>Average forecast gap by buying day</title>
        <desc id={`${id}-desc`}>
          Chronological daily mean absolute error in MW. Missing days break the line. Exact readings
          and coverage are available in the daily table below.
        </desc>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              className="grid-line"
              x1={p.left}
              x2={p.width - p.right}
              y1={y((max * i) / 3)}
              y2={y((max * i) / 3)}
            />
            <text className="axis-label" x={p.left - 12} y={y((max * i) / 3) + 5} textAnchor="end">
              {number((max * i) / 3, 0)}
            </text>
          </g>
        ))}
        <text className="axis-label" x={p.left} y={25}>
          Average gap · MW
        </text>
        <path className="forecast-line" style={{ strokeDasharray: 'none' }} d={path} />
        {days.map(
          (day) =>
            day.metrics.mae_mw !== null && (
              <circle
                key={day.decision_date}
                className="forecast-point"
                cx={x(day.decision_date)}
                cy={y(day.metrics.mae_mw)}
                r={4}
              >
                <title>
                  {dateLabel(day.decision_date)}: {power(day.metrics.mae_mw)};{' '}
                  {day.metrics.coverage.matched_hours}/24 hours
                </title>
              </circle>
            ),
        )}
        {tickIndexes.map((index) => (
          <text
            key={index}
            className="axis-label"
            x={x(days[index].decision_date)}
            y={p.height - 36}
            textAnchor={
              index === 0 && days.length > 1
                ? 'start'
                : index === days.length - 1 && days.length > 1
                  ? 'end'
                  : 'middle'
            }
          >
            {dateLabel(days[index].decision_date).slice(0, 6)}
          </text>
        ))}
      </svg>
      <figcaption className="text-xs leading-relaxed text-muted-foreground">
        Buying decision date · Each point describes the next day’s delivery. Smaller means the
        forecast was closer to reported generation.
      </figcaption>
    </figure>
  );
}

export function ErrorDistribution({ bins }: { bins: HistogramBin[] }) {
  const id = useId();
  const p = usePlot(true);
  if (!bins.length)
    return (
      <p className="py-12 text-sm text-muted-foreground">
        No matched hours are available for a distribution.
      </p>
    );
  const min = bins[0].lower_mw,
    max = bins.at(-1)!.upper_mw;
  const x = (value: number) => p.left + ((value - min) / (max - min || 1)) * p.plotWidth;
  const countMax = Math.max(1, ...bins.map((bin) => bin.count));
  const y = (value: number) => p.top + (1 - value / countMax) * p.plotHeight;
  const ticks = [...new Set([min, 0, max])];
  return (
    <figure>
      <svg
        className={`analysis-chart ${p.compact ? 'compact-chart' : ''}`}
        viewBox={`0 0 ${p.width} ${p.height}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How often the forecast was high or low</title>
        <desc id={`${id}-desc`}>
          Signed forecast minus actual differences in MW, grouped into intervals. Bar width follows
          the interval boundaries; bar height counts matched hours. Negative means forecast too low,
          positive means too high.
        </desc>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              className="grid-line"
              x1={p.left}
              x2={p.width - p.right}
              y1={y((countMax * i) / 3)}
              y2={y((countMax * i) / 3)}
            />
            <text
              className="axis-label"
              x={p.left - 12}
              y={y((countMax * i) / 3) + 5}
              textAnchor="end"
            >
              {number((countMax * i) / 3, 0)}
            </text>
          </g>
        ))}
        <text className="axis-label" x={p.left} y={25}>
          Number of hours
        </text>
        {bins.map((bin, i) => (
          <rect
            key={i}
            x={x(bin.lower_mw) + 1}
            y={y(bin.count)}
            width={Math.max(0, x(bin.upper_mw) - x(bin.lower_mw) - 2)}
            height={y(0) - y(bin.count)}
            className={
              bin.upper_mw <= 0 ? 'error-under' : bin.lower_mw >= 0 ? 'error-over' : 'error-neutral'
            }
          >
            <title>
              {signed(bin.lower_mw)} to {signed(bin.upper_mw)} MW: {bin.count} hours; upper bound{' '}
              {bin.upper_inclusive ? 'included' : 'excluded'}
            </title>
          </rect>
        ))}
        {min <= 0 && max >= 0 && (
          <line className="zero-line" x1={x(0)} x2={x(0)} y1={p.top} y2={y(0)} />
        )}
        {ticks
          .filter((tick) => tick >= min && tick <= max)
          .map((tick) => (
            <text
              key={tick}
              className="axis-label"
              x={x(tick)}
              y={p.height - 36}
              textAnchor={tick === min ? 'start' : tick === max ? 'end' : 'middle'}
            >
              {signed(tick)}
            </text>
          ))}
      </svg>
      <figcaption className="flex flex-wrap justify-between gap-2 text-xs leading-relaxed text-muted-foreground">
        <span>− More wind than forecast</span>
        <span>Difference · MW</span>
        <span>+ Less wind than forecast</span>
      </figcaption>
    </figure>
  );
}

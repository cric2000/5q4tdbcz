import { useId, useSyncExternalStore } from 'react';
import type { DailyMetric, Evolution, HistogramBin } from './api';
import { dateLabel, number, power, signed, timestampLabel } from './format';

const query = '(max-width: 640px)';
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
}
function usePlot(smallPanel = false) {
  const narrowViewport = useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
  const compact = narrowViewport || smallPanel;
  const width = compact ? 560 : 1040;
  const height = compact ? 360 : 320;
  const left = compact ? 90 : 80,
    right = 24,
    top = 44,
    bottom = 68;
  return {
    compact,
    width,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth: width - left - right,
    plotHeight: height - top - bottom,
  };
}
const publicationLabel = (value: string) => timestampLabel(value) + ' UTC';

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
        <span>− Forecast too low</span>
        <span>Difference · MW</span>
        <span>+ Forecast too high</span>
      </figcaption>
    </figure>
  );
}

export function PublicationTimeline({
  evolution,
  selected,
  onSelect,
  onInspect = onSelect,
}: {
  evolution: Evolution;
  selected: number;
  onSelect: (index: number) => void;
  onInspect?: (index: number) => void;
}) {
  const id = useId();
  const p = usePlot();
  const rows = evolution.publications;
  const cutoff = Date.parse(evolution.cutoff);
  // Include the cutoff even when the stored history lies entirely on one side of it.
  const first = Math.min(cutoff, ...rows.map((row) => Date.parse(row.publish_time)));
  const last = Math.max(cutoff, ...rows.map((row) => Date.parse(row.publish_time)));
  const pad = Math.max(1800000, (last - first) * 0.08);
  const minTime = first - pad,
    maxTime = last + pad;
  const x = (time: number) => p.left + ((time - minTime) / (maxTime - minTime)) * p.plotWidth;
  const maxPower =
    Math.max(100, evolution.comparison.actual_mw ?? 0, ...rows.map((row) => row.generation_mw)) *
    1.15;
  const y = (value: number) => p.top + (1 - value / maxPower) * p.plotHeight;
  // A publication remains the latest known value until the next publication; no interpolated forecast.
  const path = rows
    .map(
      (row, i) =>
        `${i ? 'H' + x(Date.parse(row.publish_time)) + ' V' : 'M' + x(Date.parse(row.publish_time)) + ','}${y(row.generation_mw)}`,
    )
    .join(' ');
  return (
    <figure>
      <svg
        className={`analysis-chart ${p.compact ? 'compact-chart' : ''}`}
        viewBox={`0 0 ${p.width} ${p.height}`}
        role="group"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>Forecast publication timeline</title>
        <desc id={`${id}-desc`}>
          Publication timestamps are spaced by elapsed time in UTC. A step line shows published
          forecast values. The dashed vertical line marks the buying deadline; later publications
          are shaded. The horizontal reported-power line is retrospective. Use arrow keys to inspect
          publications. The history table provides all exact readings.
        </desc>
        <rect
          x={x(cutoff)}
          y={p.top}
          width={p.width - p.right - x(cutoff)}
          height={p.plotHeight}
          fill="var(--muted)"
        />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              className="grid-line"
              x1={p.left}
              x2={p.width - p.right}
              y1={y((maxPower * i) / 3)}
              y2={y((maxPower * i) / 3)}
            />
            <text
              className="axis-label"
              x={p.left - 12}
              y={y((maxPower * i) / 3) + 5}
              textAnchor="end"
            >
              {number((maxPower * i) / 3, 0)}
            </text>
          </g>
        ))}
        <text className="axis-label" x={p.left} y={25}>
          Wind power · MW
        </text>
        {evolution.comparison.actual_mw !== null && (
          <line
            className="actual-line"
            x1={p.left}
            x2={p.width - p.right}
            y1={y(evolution.comparison.actual_mw)}
            y2={y(evolution.comparison.actual_mw)}
          />
        )}
        <path className="forecast-line" style={{ strokeDasharray: 'none' }} d={path} />
        <line
          className="cutoff-line"
          x1={x(cutoff)}
          x2={x(cutoff)}
          y1={p.top}
          y2={p.height - p.bottom}
        />
        <text
          className="axis-label"
          x={x(cutoff) + (x(cutoff) > p.width - 150 ? -8 : 8)}
          y={p.top + 18}
          textAnchor={x(cutoff) > p.width - 150 ? 'end' : 'start'}
        >
          Deadline
        </text>
        {rows.map((row, index) => (
          <g
            key={row.publish_time}
            className="publication-point"
            role="button"
            tabIndex={index === selected ? 0 : -1}
            aria-pressed={selected === index}
            aria-label={`Inspect publication ${publicationLabel(row.publish_time)}: ${power(row.generation_mw)}${row.selected_as_of ? ', used for the buying decision' : ''}`}
            onClick={() => onInspect(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onInspect(index);
              }
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? rows.length - 1
                    : event.key === 'ArrowRight'
                      ? Math.min(rows.length - 1, index + 1)
                      : event.key === 'ArrowLeft'
                        ? Math.max(0, index - 1)
                        : null;
              if (next !== null) {
                event.preventDefault();
                onSelect(next);
                event.currentTarget.parentElement
                  ?.querySelectorAll<SVGGElement>('.publication-point')
                  [next]?.focus();
              }
            }}
          >
            <circle
              className="publication-hit"
              cx={x(Date.parse(row.publish_time))}
              cy={y(row.generation_mw)}
              r={14}
              fill="transparent"
            />
            <circle
              className="forecast-point"
              cx={x(Date.parse(row.publish_time))}
              cy={y(row.generation_mw)}
              r={row.selected_as_of || index === selected ? 6 : 3}
              style={{
                fill: row.selected_as_of ? 'var(--primary)' : 'white',
                stroke: row.available_at_cutoff ? 'var(--primary)' : '#777',
              }}
            />
          </g>
        ))}
        <text className="axis-label" x={p.left} y={p.height - 36} textAnchor="start">
          {timestampLabel(new Date(first).toISOString())}
        </text>
        {last !== first && (
          <text className="axis-label" x={p.width - p.right} y={p.height - 36} textAnchor="end">
            {timestampLabel(new Date(last).toISOString())}
          </text>
        )}
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-2 text-xs leading-relaxed text-muted-foreground">
        <span className="flex items-center gap-2">
          <i className="w-5 border-t-2 border-primary" aria-hidden="true" />
          Published forecast
        </span>
        <span className="flex items-center gap-2">
          <i className="w-5 border-t-2 border-actual" aria-hidden="true" />
          Reported after delivery
        </span>
        <span>Filled green point: used at the deadline</span>
        <span>Shaded area: after the buying deadline · UTC / GMT</span>
      </figcaption>
    </figure>
  );
}

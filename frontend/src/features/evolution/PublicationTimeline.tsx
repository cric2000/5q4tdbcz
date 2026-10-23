import type { Evolution } from '@/api';
import { usePlot } from '@/hooks/usePlot';
import { number, power, timestampLabel } from '@/lib/format';
import { useId } from 'react';

const publicationLabel = (value: string) => timestampLabel(value) + ' UTC';

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

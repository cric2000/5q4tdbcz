import { useId, useSyncExternalStore } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { HourlyComparison } from './api';
import { hourLabel, number, power, signed } from './format';

const compactQuery = '(max-width: 640px)';
function subscribeViewport(listener: () => void) {
  const media = window.matchMedia?.(compactQuery);
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
}
const compactSnapshot = () => window.matchMedia?.(compactQuery).matches ?? false;

// Start a separate segment after every missing observation; never draw across a gap.
function linePath(
  hours: HourlyComparison[],
  field: 'forecast_mw' | 'actual_mw',
  x: (index: number) => number,
  y: (value: number) => number,
) {
  let connected = false;
  return hours
    .map((hour, index) => {
      const value = hour[field];
      if (value === null) {
        connected = false;
        return '';
      }
      const command = connected ? 'L' : 'M';
      connected = true;
      return `${command}${x(index)},${y(value)}`;
    })
    .join(' ');
}

export default function ReplayChart({
  hours,
  selected,
  onSelect,
  onInspect = onSelect,
  showActuals = true,
}: {
  hours: HourlyComparison[];
  selected: number;
  onSelect: (hour: number) => void;
  onInspect?: (hour: number) => void;
  showActuals?: boolean;
}) {
  const id = useId();
  const compact = useSyncExternalStore(subscribeViewport, compactSnapshot, () => false);
  const width = compact ? 560 : 1040;
  const left = compact ? 84 : 64,
    right = 20,
    top = compact ? 32 : 22,
    bottom = 32;
  const plotWidth = width - left - right;
  const x = (index: number) => left + ((index + 0.5) * plotWidth) / 24;
  const height = compact ? 320 : 360;
  const values = hours
    .flatMap((hour) => [hour.forecast_mw, ...(showActuals ? [hour.actual_mw] : [])])
    .filter((value): value is number => value !== null);
  const max = Math.max(1000, Math.ceil(Math.max(0, ...values) / 4000) * 4000);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const errors = hours.flatMap((hour) => (hour.error_mw === null ? [] : [Math.abs(hour.error_mw)]));
  const errorMax = Math.max(500, Math.ceil(Math.max(0, ...errors) / 1000) * 1000);
  const errorY = (value: number) => (compact ? 92 : 75) - (value / errorMax) * (compact ? 55 : 47);
  const tickHours = compact ? [0, 6, 12, 18, 23] : [0, 3, 6, 9, 12, 15, 18, 21, 23];
  return (
    <>
      {showActuals && (
        <div className="mb-3 flex flex-wrap gap-4 px-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <i className="w-5 border-t-2 border-dashed border-primary" aria-hidden="true" />
            Forecast at deadline
          </span>
          <span className="flex items-center gap-2">
            <i className="w-5 border-t-2 border-actual" aria-hidden="true" />
            Reported after delivery
          </span>
        </div>
      )}
      <figure>
        <div className="chart-overflow">
          <svg
            className={compact ? 'compact-chart' : ''}
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-labelledby={`${id}-title ${id}-description`}
          >
            <title id={`${id}-title`}>
              {showActuals
                ? 'Hourly forecast and actual wind generation'
                : 'Hourly wind forecast available at the buying deadline'}
            </title>
            <desc id={`${id}-description`}>
              Power in MW by UTC delivery hour. Forecast is dashed.{' '}
              {showActuals
                ? 'Actual is solid and known after delivery.'
                : 'Each forecast was published by the buying deadline.'}{' '}
              Focus or select an hour for details. Missing readings leave gaps. Full values are in
              the hourly evidence table.
            </desc>
            {[0, 1, 2, 3, 4].map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y((max * tick) / 4)}
                  y2={y((max * tick) / 4)}
                  className="grid-line"
                />
                <text
                  x={left - 12}
                  y={y((max * tick) / 4) + 4}
                  textAnchor="end"
                  className="axis-label"
                >
                  {number((max * tick) / 4, 0)}
                </text>
              </g>
            ))}
            <text x={left} y={compact ? 17 : 12} className="axis-label">
              Wind power (MW)
            </text>
            <path d={linePath(hours, 'forecast_mw', x, y)} className="forecast-line" />
            {showActuals && <path d={linePath(hours, 'actual_mw', x, y)} className="actual-line" />}
            {hours.map((hour, index) => (
              <g
                key={hour.target_time}
                role="button"
                tabIndex={selected === index ? 0 : -1}
                aria-label={`${hourLabel(hour.target_time)} UTC: forecast ${power(hour.forecast_mw)}${showActuals ? `, actual ${power(hour.actual_mw)}` : ''}`}
                aria-pressed={selected === index}
                onFocus={() => onSelect(index)}
                onMouseEnter={() => onSelect(index)}
                onClick={() => onInspect(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onInspect(index);
                  }
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? 23
                          : Math.max(
                              0,
                              Math.min(23, index + (event.key === 'ArrowRight' ? 1 : -1)),
                            );
                    const sibling =
                      event.currentTarget.parentElement?.querySelectorAll<SVGGElement>(
                        '[role="button"]',
                      )[next];
                    sibling?.focus();
                  }
                }}
                className="chart-hour"
              >
                <rect
                  x={x(index) - plotWidth / 48}
                  y={top}
                  width={plotWidth / 24}
                  height={height - top - bottom}
                  className={selected === index ? 'hour-hit selected' : 'hour-hit'}
                />
                {selected === index && (
                  <line
                    x1={x(index)}
                    x2={x(index)}
                    y1={top}
                    y2={height - bottom}
                    className="selection-line"
                  />
                )}
                {hour.forecast_mw !== null && (
                  <circle
                    cx={x(index)}
                    cy={y(hour.forecast_mw)}
                    r={selected === index ? 4.5 : 2.6}
                    className="forecast-point"
                  />
                )}
                {showActuals && hour.actual_mw !== null && (
                  <circle
                    cx={x(index)}
                    cy={y(hour.actual_mw)}
                    r={selected === index ? 4.5 : 2.6}
                    className="actual-point"
                  />
                )}
              </g>
            ))}
            {tickHours.map((index) => (
              <text
                key={index}
                x={x(index)}
                y={height - 10}
                textAnchor="middle"
                className="axis-label"
              >
                {hourLabel(hours[index].target_time)}
              </text>
            ))}
          </svg>
        </div>
        <figcaption className="mt-2 flex flex-wrap justify-between gap-2 px-3 pb-5 text-[10px] leading-relaxed text-neutral-500">
          <span>Delivery hour · UTC / GMT</span>
          <span>
            Choose a point or use the hour controls above. Arrow keys move between points.
          </span>
        </figcaption>
      </figure>
      {showActuals && (
        <Accordion type="single" collapsible className="border-t">
          <AccordionItem value="errors">
            <AccordionTrigger className="py-4 text-xs font-medium text-neutral-600 hover:no-underline">
              See how much the forecast missed each hour
            </AccordionTrigger>
            <AccordionContent>
              <p className="mb-4 text-xs leading-relaxed text-neutral-500">
                Bars above zero mean the forecast was too high. Bars below zero mean it was too low.
                Taller bars mean a larger difference. Missing comparisons have no bar.
              </p>
              <div className="mb-3 flex flex-wrap justify-between gap-2 text-[11px] text-neutral-500">
                <h3>Forecast minus actual power</h3>
                <span>Difference in MW</span>
              </div>
              <figure>
                <div className="chart-overflow">
                  <svg
                    className={compact ? 'compact-chart' : ''}
                    viewBox={`0 0 ${width} ${compact ? 180 : 150}`}
                    role="img"
                    aria-labelledby={`${id}-errors`}
                  >
                    <title id={`${id}-errors`}>
                      Hourly signed forecast errors in MW. Above zero is overforecast; below zero is
                      underforecast. Missing errors are omitted.
                    </title>
                    {[-errorMax, 0, errorMax].map((tick) => (
                      <g key={tick}>
                        <line
                          x1={left}
                          x2={width - right}
                          y1={errorY(tick)}
                          y2={errorY(tick)}
                          className={tick === 0 ? 'zero-line' : 'grid-line'}
                        />
                        <text
                          x={left - 12}
                          y={errorY(tick) + 4}
                          textAnchor="end"
                          className="axis-label"
                        >
                          {signed(tick)}
                        </text>
                      </g>
                    ))}
                    {hours.map((hour, index) =>
                      hour.error_mw === null ? null : (
                        <rect
                          key={hour.target_time}
                          x={x(index) - plotWidth / 80}
                          y={
                            Math.min(errorY(hour.error_mw), errorY(0)) -
                            (hour.error_mw === 0 ? 1 : 0)
                          }
                          width={plotWidth / 40}
                          height={Math.max(2, Math.abs(errorY(hour.error_mw) - errorY(0)))}
                          rx={2}
                          className={
                            hour.error_mw > 0
                              ? 'error-over'
                              : hour.error_mw < 0
                                ? 'error-under'
                                : 'error-exact'
                          }
                        >
                          <title>
                            {hourLabel(hour.target_time)} UTC: {signed(hour.error_mw)} MW
                          </title>
                        </rect>
                      ),
                    )}
                    {tickHours.map((index) => (
                      <text
                        key={index}
                        x={x(index)}
                        y={compact ? 174 : 144}
                        textAnchor="middle"
                        className="axis-label"
                      >
                        {hourLabel(hours[index].target_time)}
                      </text>
                    ))}
                  </svg>
                </div>
                <figcaption className="flex justify-center gap-4 py-2 text-[10px] text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <i className="size-2 rounded-xs bg-[#e6a052]" aria-hidden="true" />
                    Forecast too high (+)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="size-2 rounded-xs bg-[#526b85]" aria-hidden="true" />
                    Forecast too low (−)
                  </span>
                </figcaption>
              </figure>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </>
  );
}

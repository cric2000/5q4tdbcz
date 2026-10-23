import type { Evolution } from '@/api';
import { Boundaries, EvidencePanel, Statistic } from '@/components/analysis/AnalysisPrimitives';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PublicationTimeline } from '@/features/evolution/PublicationTimeline';
import { dateLabel, hourLabel, number, power, signed, timestampLabel } from '@/lib/format';
import { revealDetails } from '@/lib/selection';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useRef, useState } from 'react';

export function EvolutionResults({ evolution }: { evolution: Evolution }) {
  const rows = evolution.publications;
  const chosenIndex = rows.findIndex((row) => row.selected_as_of);
  const [selected, setSelected] = useState(Math.max(0, chosenIndex));
  const row = rows[selected];
  const detailsRef = useRef<HTMLElement>(null);
  const inspectPublication = (index: number) => {
    setSelected(index);
    revealDetails(detailsRef.current);
  };
  const comparison = evolution.comparison;
  const before = rows.filter((publication) => publication.available_at_cutoff).length;
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
        <Statistic title="Available at the buying deadline" value={power(comparison.forecast_mw)}>
          Latest publication at or before the deadline, including a publication exactly at the
          deadline.
        </Statistic>
        <Statistic title="Known only after delivery" value={power(comparison.actual_mw)}>
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
            later
          </p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              No publications were acquired for this delivery hour.
            </p>
          ) : (
            <PublicationTimeline
              evolution={evolution}
              selected={selected}
              onSelect={setSelected}
              onInspect={inspectPublication}
            />
          )}
          {row && (
            <section
              ref={detailsRef}
              tabIndex={-1}
              className="mt-5 scroll-mt-6 rounded-md border bg-primary/[.025] p-5 outline-none focus:ring-2 focus:ring-primary/25"
              aria-label="Selected publication details"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Selected publication · {selected + 1} of {rows.length}
                  </p>
                  <h4
                    className="mt-1 text-base font-semibold"
                    aria-live="polite"
                    aria-atomic="true"
                  >
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
              {!row.selected_as_of && chosenIndex >= 0 && (
                <p className="mt-3 text-xs font-medium text-foreground">
                  This is an update you are exploring. The buying-time forecast above stays fixed.
                </p>
              )}
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
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          View details brings the chosen publication into view above. Exploring an update does not
          change the forecast used for the buying decision.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[570px] text-left text-xs">
            <caption className="sr-only">Forecast publication history</caption>
            <thead className="border-b text-muted-foreground">
              <tr>
                {['Publication · UTC', 'Forecast · MW', 'Available by deadline?', 'Details'].map(
                  (label, index) => (
                    <th
                      key={label}
                      className={`px-3 py-3 font-medium ${index === 1 ? 'text-right' : ''}`}
                    >
                      {label}
                    </th>
                  ),
                )}
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
                  <td className="px-3 py-3 text-right tabular-nums">
                    {number(publication.generation_mw)}
                  </td>
                  <td className="px-3 py-3">
                    {publication.available_at_cutoff ? 'Yes' : 'No · later'}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Inspect stored publication ${timestampLabel(publication.publish_time)} UTC`}
                      aria-pressed={selected === index}
                      onClick={() => inspectPublication(index)}
                    >
                      View details
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

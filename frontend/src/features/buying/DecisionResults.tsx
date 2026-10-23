import type { Decision, PriorAccuracy } from '@/api';
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
import { DailyReview, MetricExplanations } from '@/features/buying/DailyReview';
import { ForecastAnswer } from '@/features/buying/ForecastAnswer';
import { HistoricalContext } from '@/features/buying/HistoricalContext';
import { HourInspector } from '@/features/buying/HourInspector';
import { Evidence } from '@/features/buying/HourlyEvidence';
import ReplayChart from '@/features/buying/ReplayChart';
import type { ReplayActions } from '@/features/buying/types';
import type { Resource } from '@/hooks/useResource';
import { dateLabel, timestampLabel } from '@/lib/format';
import { revealDetails } from '@/lib/selection';
import { ArrowRight, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';

export function DecisionResults({
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
      <Accordion type="single" collapsible>
        <AccordionItem value="day-review">
          <AccordionTrigger className="py-5 text-sm">
            Review this day after delivery
          </AccordionTrigger>
          <AccordionContent>
            <DailyReview decision={decision} />
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

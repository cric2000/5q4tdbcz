import { sameAnalysis } from '@/api';
import type { Decision, PriorAccuracy } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Resource } from '@/hooks/useResource';
import { power, timestampLabel } from '@/lib/format';
import { ArrowRight } from 'lucide-react';

export function HistoricalContext({
  history,
  retry,
  refresh,
  decision,
  onExplore,
}: {
  history: Resource<PriorAccuracy>;
  retry: () => void;
  refresh: () => void;
  decision: Decision;
  onExplore: () => void;
}) {
  return (
    <Card
      className="gap-0 overflow-hidden py-0 shadow-none lg:col-start-2 lg:row-start-1 lg:row-span-2"
      role="region"
      aria-label="Historical reliability"
    >
      <CardHeader className="border-b p-5 sm:p-6">
        <p className="text-[10px] font-semibold tracking-[.14em] text-primary">
          02 · THE HISTORICAL GAP
        </p>
        <h2 className="text-lg font-semibold">How close were the forecasts?</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Evidence available by {timestampLabel(decision.cutoff)} UTC
        </p>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        {history.state === 'loading' && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading historical accuracy…
          </p>
        )}
        {history.state === 'error' && (
          <div>
            <p className="text-sm text-muted-foreground">
              Historical accuracy could not be loaded. The buying-time forecast is still available.
            </p>
            <Button variant="outline" className="mt-3" onClick={retry}>
              Retry historical accuracy
            </Button>
          </div>
        )}
        {history.state === 'ready' &&
          (!sameAnalysis(history.value.meta, decision.meta) ? (
            <div>
              <p role="alert" className="text-sm text-destructive">
                The accuracy reference does not match this forecast. Reload the overview before
                comparing them.
              </p>
              <Button variant="outline" className="mt-3" onClick={refresh}>
                Refresh overview
              </Button>
            </div>
          ) : history.value.metrics.coverage.matched_hours === 0 ? (
            <div>
              <p className="text-base font-semibold">Insufficient earlier history</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {history.value.metrics.coverage.expected_hours === 0
                  ? 'No delivery hours in this snapshot had finished by this buying deadline.'
                  : 'No complete forecast and actual pairs were available by this buying deadline.'}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Later outcomes are excluded. Choose a later buying day to review the history
                available then.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Average hourly gap · MAE</p>
              <p className="mt-2 text-[32px] font-semibold tracking-tight tabular-nums">
                {power(history.value.metrics.mae_mw)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {history.value.metrics.mae_mw === null
                  ? 'There are no complete hourly comparisons in this period.'
                  : 'This is how far forecasts differed from reported generation on average, ignoring whether the forecast was high or low.'}
              </p>
              <div className="mt-5 border-t pt-4">
                <p className="text-sm font-medium">
                  {history.value.metrics.bias_mw === null
                    ? 'Average direction unavailable'
                    : history.value.metrics.bias_mw > 0
                      ? 'Forecasts were higher on average'
                      : history.value.metrics.bias_mw < 0
                        ? 'Forecasts were lower on average'
                        : 'High and low differences balanced on average'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {history.value.metrics.bias_mw === null
                    ? 'Complete comparisons are needed.'
                    : history.value.metrics.bias_mw === 0
                      ? 'Individual hours can still have large differences.'
                      : `${power(Math.abs(history.value.metrics.bias_mw))} ${history.value.metrics.bias_mw > 0 ? 'above' : 'below'} reported power, keeping the direction of each difference.`}
                </p>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                {history.value.metrics.coverage.matched_hours} /{' '}
                {history.value.metrics.coverage.expected_hours} hours compared · completed earlier
                hours
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Delivery window: {timestampLabel(history.value.delivery_start)}–
                {timestampLabel(history.value.delivery_end)} UTC
              </p>
              <p className="mt-3 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                Only completed hours with both actual readings published by this deadline. Earlier
                evidence is not a guaranteed future error range.
              </p>
            </>
          ))}
        <Button variant="outline" className="mt-5 w-full" onClick={onExplore}>
          Explore historical accuracy
          <ArrowRight aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}

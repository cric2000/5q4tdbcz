import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Loader2, TriangleAlert } from 'lucide-react';

export function LoadingPanel({ message }: { message: string }) {
  return (
    <Card role="status" className="gap-4 p-6 shadow-none">
      <div className="flex items-center gap-3">
        <Loader2
          className="size-4 animate-spin text-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        <h2 className="text-sm font-medium">{message}</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Loading the forecast and reported wind generation.
      </p>
      <div aria-hidden="true" className="grid grid-cols-3 gap-4">
        <Skeleton className="h-18 rounded-sm" />
        <Skeleton className="h-18 rounded-sm" />
        <Skeleton className="h-18 rounded-sm" />
      </div>
    </Card>
  );
}

export function ErrorPanel({
  message,
  retry,
  label = 'Try again',
}: {
  message: string;
  retry: () => void;
  label?: string;
}) {
  return (
    <Alert variant="destructive" className="bg-white p-6">
      <TriangleAlert className="size-4" />
      <AlertTitle>We couldn’t load this view.</AlertTitle>
      <AlertDescription>
        <p className="mt-1 leading-relaxed">{message}</p>
        <Button variant="outline" className="mt-4 text-foreground" onClick={retry}>
          {label}
          <ArrowRight aria-hidden="true" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}

const inconsistent =
  'The snapshot or cutoff changed while this page was open. Refresh the analysis to use consistent data.';

export function AnalysisReferenceError({ refresh }: { refresh: () => void }) {
  return <ErrorPanel message={inconsistent} retry={refresh} label="Refresh analysis" />;
}

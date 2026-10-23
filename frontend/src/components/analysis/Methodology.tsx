import type { Metadata } from '@/api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { number, timestampLabel } from '@/lib/format';
import { ArrowUpRight } from 'lucide-react';

export function Methodology({ metadata }: { metadata: Metadata }) {
  return (
    <section id="data-sources" className="mt-8 scroll-mt-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold">Sources and assumptions</h2>
      </div>
      <Accordion type="multiple" className="rounded-lg border bg-white px-5 sm:px-6">
        <AccordionItem value="sources">
          <AccordionTrigger className="py-5">Where the numbers come from</AccordionTrigger>
          <AccordionContent className="space-y-4 text-sm leading-[1.85] text-muted-foreground">
            <p className="max-w-3xl">
              Elexon WINDFOR provides the expected wind power and when each forecast was published.
              Elexon FUELHH WIND provides the reported wind power for each half-hour. For each
              next-day hour, we use the latest forecast published by {metadata.decision_cutoff_gmt}{' '}
              GMT on the buying day and average both actual half-hour readings. The actual readings
              became available after the buying decision.
            </p>
            <div className="flex flex-wrap gap-3">
              {metadata.sources.map((source) => (
                <Button key={source.dataset} asChild variant="outline" size="sm">
                  <a href={source.documentation_url} target="_blank" rel="noreferrer">
                    Elexon {source.dataset}
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                </Button>
              ))}
            </div>
            <p className="text-xs">
              {number(metadata.snapshot.forecast_records, 0)} forecast versions ·{' '}
              {number(metadata.snapshot.outturn_half_hours, 0)} actual half-hours · Retrieved{' '}
              {timestampLabel(metadata.snapshot.retrieved_at)} UTC
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="limits">
          <AccordionTrigger className="py-5">
            Assumptions and limits of this comparison
          </AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
              {metadata.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';

export function EvidencePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Accordion type="multiple" className="rounded-lg border bg-white px-5 sm:px-6">
      <AccordionItem value="evidence">
        <AccordionTrigger className="py-5 text-sm">{title}</AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function Statistic({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="grid content-start gap-3 rounded-lg p-5 shadow-none sm:p-6">
      <h3 className="min-h-10 text-sm font-medium leading-5 text-muted-foreground">{title}</h3>
      <p className="text-[32px] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </Card>
  );
}

export function Boundaries() {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <span>
        These are historical differences between national Elexon series, which may cover different
        groups of wind farms. They are not a guaranteed error range or a purchase recommendation.
        Demand, existing contracts and your utility’s own supply are also needed to plan a purchase.
      </span>
    </p>
  );
}

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export function ProductGuide() {
  return (
    <section id="how-it-works" className="mt-8 scroll-mt-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold">A little context goes a long way.</h2>
      </div>
      <Accordion type="multiple" className="rounded-lg border bg-white px-5 sm:px-6">
        <AccordionItem value="help">
          <AccordionTrigger className="py-5">
            How does this help with a buying decision?
          </AccordionTrigger>
          <AccordionContent className="max-w-3xl text-sm leading-[1.85] text-muted-foreground">
            Your team needs a wind estimate before deciding what other electricity to buy. WindSight
            shows the latest forecast available at the decision deadline, then measures its
            historical difference from reported generation. Use that evidence to assess the wind
            assumption in your plan. Customer demand, existing contracts and the renewable supply
            available to your utility are also needed to calculate a purchase quantity. This pilot
            replays January 2026; it does not supply live trading instructions.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="terms">
          <AccordionTrigger className="py-5">
            What do forecast, actual, MW and deadline mean?
          </AccordionTrigger>
          <AccordionContent>
            <dl className="grid gap-4 text-xs leading-relaxed sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Forecast</dt>
                <dd className="mt-1 text-muted-foreground">
                  The wind power expected for a delivery hour, using a version published before the
                  buying deadline.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Actual</dt>
                <dd className="mt-1 text-muted-foreground">
                  The wind power reported after delivery. We average the two half-hour readings for
                  each hour.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">MW · megawatts</dt>
                <dd className="mt-1 text-muted-foreground">
                  A measure of power. Higher MW means more electricity generated at that time; it is
                  not an energy total for the day.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Decision deadline · cutoff</dt>
                <dd className="mt-1 text-muted-foreground">
                  Only forecasts published by this time on the buying day can be used in the replay.
                  The assumed time is shown beside the buying date when historical data is
                  available.
                </dd>
              </div>
            </dl>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

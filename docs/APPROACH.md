# Methodology and implementation choices

## Customer need and scope

I built the pilot around two questions: which wind forecast was available when buying, and how far earlier forecasts differed from reported generation. One buying-date selection answers both; detailed analysis is optional.

I interpret January 2026 **buying decisions** as January 1–31, with D+1 delivery on January 2–February 1. All timestamps use UTC; for this January period UTC matches UK local time (GMT). Power is measured in MW, not MWh.

## Sources and assumptions

| Source | Use in this implementation |
| --- | --- |
| [Elexon WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) | Wind forecasts: `startTime` identifies the delivery target, `publishTime` identifies availability, and `generation` is forecast MW. |
| [Elexon FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) | Reported generation: filter WIND and use both 30-minute average-MW readings for an hour. I chose their mean for alignment with the hourly forecast. |
| [Nord Pool N2EX reference](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction) | Basis for the pilot's configurable 09:50 GMT assumption. The client did not specify its exchange or deadline; this is not a universal UK market rule. |

## Forecast selection and errors

For each exact next-day target, I select the publication with the greatest `publishTime` satisfying `publishTime <= buying cutoff`. Equality is eligible; later revisions remain visible in history but cannot replace the original forecast.

Hourly actual power is `(first half-hour MW + second half-hour MW) / 2`. Both readings are required. Signed error is **forecast minus actual**: positive means the forecast was high. MAE measures average absolute difference; bias retains direction; RMSE emphasizes larger misses. Absolute-error percentiles use linear interpolation at `(n - 1) * quantile`.

Statistics use matched pairs only. Coverage uses all expected hours in the requested scope. Missing forecasts and incomplete actuals have explicit reasons, genuine zeros remain valid, and empty samples return null error measures.

## Accuracy available when buying

The overview uses a separate prior-accuracy endpoint. A historical delivery hour qualifies only when it has ended and both stored actual readings were published at or before the **selected buying deadline**. Its forecast still uses its own original buying deadline. Completed hours earlier on the selected buying day can qualify; unfinished hours cannot.

The response includes the eligible delivery window and matched coverage. With no earlier eligible pairs, the UI shows insufficient history. The snapshot stores one actual publication per half-hour: an excluded later record is not replaced with an invented earlier version.

The optional date-range analysis is explicitly retrospective and may include outcomes after earlier buying decisions. It is separate from the overview's deadline-constrained evidence.

## Data preparation and reproducibility

Ingestion requests daily WINDFOR publication windows from December 29, 2025 through February 2, 2026, retaining January 2–February 1 targets. FUELHH is fetched by individual settlement date with WIND filtering; publication-date and settlement-date filters are not combined.

I validate dataset identity, timestamps, period alignment, numeric MW values and duplicate keys. Conflicts fail ingestion; identical duplicates may be deduplicated. Request provenance, retrieval metadata and coverage are stored with the data. A validated temporary database replaces the development snapshot atomically; incomplete acquisition fails by default.

The packaged dataset contains **18,104 forecast versions, 1,488 actual half-hours and 744 matched hours** at the recorded 09:50 cutoff. Its [manifest](../backend/snapshot/manifest.json) records file/content checksums and acquisition metadata. Release validation recomputes identity and coverage offline. Startup and analytical requests never fetch Elexon data.

## Architecture and tradeoffs

- **React/TypeScript, shadcn/ui and Tailwind:** a single buying overview, with optional actuals, tables and deeper views. SVG supplies charts without another chart dependency.
- **FastAPI and SQLite:** typed routes delegate to shared calculations and read-only repositories. A prepared snapshot makes the historical pilot reproducible without an external runtime database.
- **Request safety:** the frontend checks consumed fields, date/window boundaries and snapshot/cutoff references; it aborts abandoned requests and hides stale results. Summary failures leave the forecast usable. Selection and derived values do not require additional Effects.
- **Development and release:** Docker development uses source mounts and reload. Production uses compiled assets and the validated snapshot; [deployment details](DEPLOYMENT.md) describe Docker and Vercel.

Tests cover hand-calculated errors, cutoff equality and later publications, actual-publication timing, unfinished hours, missing/zero values, February 1 delivery, API contracts and UI navigation/recovery. The [README](../README.md#test) gives reproducible checks.

## Limits

WINDFOR and FUELHH may represent different wind populations, so their gap does not isolate forecasting-model quality. Acquired publication history is bounded, and unchanged republications do not prove new model runs. Historical errors are not calibrated future prediction intervals. Demand, contracts and prices are absent; the pilot does not calculate purchase quantities, financial savings or live trading instructions.

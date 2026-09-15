# Customer Revenue Concentration

Public tracker of **top-10 share**, **largest-customer share**, and **HHI** (Herfindahl–Hirschman Index) across 18 months of sample booked revenue.

The first paint is static HTML. `curl -sL` of `index.html` already contains the summary metrics and every month row. JavaScript is not required to read the numbers.

## Formulas

All monthly metrics are computed from that month’s customer revenue only.

**Top-10 share**

\[
\text{Top-10 share} = \frac{\sum \text{revenue of the 10 largest customers}}{\text{total month revenue}}
\]

Reported as a percent of the month.

**Largest-customer share**

\[
\text{Largest share} = \frac{\max(\text{customer revenue})}{\text{total month revenue}}
\]

**HHI (0–10,000 scale)**

\[
\mathrm{HHI} = \sum_i (s_i)^2 \times 10{,}000
\]

where \(s_i\) is customer \(i\)’s share of month revenue on a **0–1** scale. Stick to this scale everywhere in the tracker:

| Book | HHI |
| --- | --- |
| One customer has all revenue | 10,000 |
| Two equal customers | 5,000 |
| Many small customers | approaches 0 |

**Month-over-month**

\[
\Delta = \text{current} - \text{previous}
\]

Shares are shown in percentage points (pp). HHI is shown in index points. The first month has no prior period, so MoM is blank (`null` in the module).

**Targets** are ceilings. A metric is within target when its value is ≤ the threshold in `data/concentration.json`.

Unsafe inputs — `null`, empty series, zero total revenue, non-finite values — return **`null`**. The module never returns `NaN` or `Infinity`.

A **single-customer month** is valid, not null: top-10 share = 100%, largest share = 100%, HHI = 10,000.

## Data

`data/concentration.json` holds:

- 18 months (`2025-04` through `2026-09`)
- 16 named customers
- Monthly revenue by customer id
- Target thresholds for top-10 share, largest-customer share, and HHI

Regenerate the sample book with:

```bash
node scripts/generate-data.js
node scripts/render-static.js
```

## How to re-render

`index.html` is generated. After changing data or formatting:

```bash
node scripts/render-static.js
```

`scripts/render-static.js` loads `js/concentration.js` and bakes the latest summary cards plus the 18-row monthly table into the markup.

## Module

`js/concentration.js` is a pure browser + Node module (UMD). In Node:

```js
const Concentration = require("./js/concentration.js");
const metrics = Concentration.computeMonthMetrics({ acme: 80, beta: 20 });
const series = Concentration.computeSeries(data.months);
const vs = Concentration.compareToTargets(metrics, data.targets);
```

In the browser it attaches `window.Concentration`. The page still renders correctly if that script never runs.

## Tests

```bash
bash scripts/test.sh
```

Covers zero revenue, empty series, null inputs, a single-customer month, and static first-paint checks (`curl -sL` / markup contains real Top-10 share, largest share, HHI, and month rows — no `Loading…` shell). Expect `Summary: N passed, 0 failed` and exit 0.

## Suggested next improvements

- Replace sample JSON with a booked-revenue export (CSV/warehouse) and keep the same renderer.
- Add a 12-month rolling HHI / top-10 chart *as enhancement only*, leaving the static table as the source of truth.
- Split new-logo vs. existing-customer concentration so a single win does not look like structural risk.
- Alerting when a metric crosses its ceiling for two consecutive months.
- Customer-level retention of rank (who entered / left the top 10) as a second baked table.

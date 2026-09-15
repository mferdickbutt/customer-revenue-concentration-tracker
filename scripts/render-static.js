#!/usr/bin/env node
"use strict";

/**
 * Bake summary metrics and the monthly table into index.html.
 * First paint does not depend on JavaScript.
 *
 *   node scripts/render-static.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "concentration.json");
const OUT_PATH = path.join(ROOT, "index.html");

const Concentration = require(path.join(ROOT, "js", "concentration.js"));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function monthLabel(iso) {
  if (!iso || typeof iso !== "string") return "—";
  const parts = iso.split("-");
  const year = parts[0];
  const month = Number(parts[1]);
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const name = names[month - 1];
  return name ? name + " " + year : iso;
}

function statusClass(within) {
  if (within === true) return "ok";
  if (within === false) return "breach";
  return "unknown";
}

function statusLabel(within) {
  if (within === true) return "Within target";
  if (within === false) return "Above target";
  return "No comparison";
}

function customerName(customers, id) {
  if (!id) return "—";
  for (let i = 0; i < customers.length; i++) {
    if (customers[i].id === id) return customers[i].name;
  }
  return id;
}

function rankedCustomers(revenue, customers) {
  if (!revenue || typeof revenue !== "object") return [];
  const rows = [];
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const amount = revenue[c.id];
    if (typeof amount === "number" && Number.isFinite(amount)) {
      rows.push({ id: c.id, name: c.name, revenue: amount });
    }
  }
  rows.sort(function (a, b) {
    return b.revenue - a.revenue;
  });
  return rows;
}

function render(data) {
  const series = Concentration.computeSeries(data.months);
  const latest = Concentration.latestSnapshot(series);
  const metrics = latest ? latest.metrics : Concentration.computeMonthMetrics(null);
  const mom = latest ? latest.mom : { top10Share: null, largestShare: null, hhi: null };
  const vs = Concentration.compareToTargets(metrics, data.targets);
  const asOf = latest && latest.month ? latest.month : data.meta.asOf;
  const largestName = customerName(data.customers, metrics.largestCustomerId);

  const cards = [
    {
      key: "top10",
      title: "Top-10 share",
      value: Concentration.formatShare(metrics.top10Share),
      mom: Concentration.formatMomShare(mom.top10Share),
      target: "Target ≤ " + Concentration.formatShare(data.targets.top10Share),
      vs: vs.top10Share,
      note: "Share of month revenue from the ten largest customers.",
    },
    {
      key: "largest",
      title: "Largest-customer share",
      value: Concentration.formatShare(metrics.largestShare),
      mom: Concentration.formatMomShare(mom.largestShare),
      target: "Target ≤ " + Concentration.formatShare(data.targets.largestCustomerShare),
      vs: vs.largestShare,
      note: largestName + " is the largest customer this month.",
    },
    {
      key: "hhi",
      title: "HHI",
      value: Concentration.formatHhi(metrics.hhi),
      mom: Concentration.formatMomHhi(mom.hhi),
      target: "Target ≤ " + Concentration.formatHhi(data.targets.hhi),
      vs: vs.hhi,
      note: "Herfindahl–Hirschman Index on a 0–10,000 scale.",
    },
  ];

  const cardHtml = cards
    .map(function (card) {
      return [
        '<article class="card ' + statusClass(card.vs.withinTarget) + '" data-metric="' + card.key + '">',
        "  <h2>" + escapeHtml(card.title) + "</h2>",
        '  <p class="value">' + escapeHtml(card.value) + "</p>",
        '  <p class="mom">MoM ' + escapeHtml(card.mom) + "</p>",
        '  <p class="target">' + escapeHtml(card.target) + "</p>",
        '  <p class="status">' + escapeHtml(statusLabel(card.vs.withinTarget)) + "</p>",
        '  <p class="note">' + escapeHtml(card.note) + "</p>",
        "</article>",
      ].join("\n        ");
    })
    .join("\n        ");

  const tableRows = series
    .slice()
    .reverse()
    .map(function (row) {
      const cmp = Concentration.compareToTargets(row.metrics, data.targets);
      const flags = [];
      if (cmp.top10Share.withinTarget === false) flags.push("Top-10");
      if (cmp.largestShare.withinTarget === false) flags.push("Largest");
      if (cmp.hhi.withinTarget === false) flags.push("HHI");
      const flagText = flags.length ? flags.join(", ") : "All within";
      return [
        '<tr data-month="' + escapeHtml(row.month || "") + '">',
        "  <th scope=\"row\">" + escapeHtml(row.month) + " <span class=\"label\">" + escapeHtml(monthLabel(row.month)) + "</span></th>",
        "  <td>" + escapeHtml(Concentration.formatMoney(row.metrics.total)) + "</td>",
        "  <td>" + escapeHtml(Concentration.formatShare(row.metrics.top10Share)) + "</td>",
        "  <td>" + escapeHtml(Concentration.formatShare(row.metrics.largestShare)) + "</td>",
        "  <td>" + escapeHtml(customerName(data.customers, row.metrics.largestCustomerId)) + "</td>",
        "  <td>" + escapeHtml(Concentration.formatHhi(row.metrics.hhi)) + "</td>",
        "  <td>" + escapeHtml(Concentration.formatMomShare(row.mom.top10Share)) + "</td>",
        "  <td>" + escapeHtml(Concentration.formatMomShare(row.mom.largestShare)) + "</td>",
        "  <td>" + escapeHtml(Concentration.formatMomHhi(row.mom.hhi)) + "</td>",
        '  <td class="' + statusClass(flags.length === 0) + '">' + escapeHtml(flagText) + "</td>",
        "</tr>",
      ].join("\n          ");
    })
    .join("\n          ");

  const ranked = latest ? rankedCustomers(latest.revenue, data.customers) : [];
  const rankedTotal = metrics.total || 0;
  const mixRows = ranked
    .map(function (row, index) {
      const share = rankedTotal > 0 ? row.revenue / rankedTotal : null;
      return [
        "<tr>",
        "  <td>" + (index + 1) + "</td>",
        "  <td>" + escapeHtml(row.name) + "</td>",
        "  <td>" + escapeHtml(Concentration.formatMoney(row.revenue)) + "</td>",
        "  <td>" + escapeHtml(Concentration.formatShare(share)) + "</td>",
        "</tr>",
      ].join("\n          ");
    })
    .join("\n          ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Customer Revenue Concentration</title>
  <meta name="description" content="Public tracker of top-10 share, largest-customer share, and HHI across 18 months.">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header>
    <p class="kicker">Public concentration tracker</p>
    <h1>Customer Revenue Concentration</h1>
    <p class="lede">
      ${escapeHtml(String(data.meta.months))} months of booked revenue across
      ${escapeHtml(String(data.customers.length))} named customers.
      Latest month <strong>${escapeHtml(monthLabel(asOf))}</strong>
      (${escapeHtml(asOf)}), total
      <strong>${escapeHtml(Concentration.formatMoney(metrics.total))}</strong>.
    </p>
  </header>

  <main>
    <section class="summary" aria-label="Latest concentration metrics">
      <h2 class="section-title">Latest month — ${escapeHtml(monthLabel(asOf))}</h2>
      <div class="cards">
        ${cardHtml}
      </div>
    </section>

    <section class="monthly" aria-label="Monthly concentration table">
      <h2 class="section-title">Monthly table</h2>
      <p class="hint">
        Top-10 share, largest-customer share, and HHI for each of the
        ${escapeHtml(String(series.length))} months, with month-over-month change.
        Targets: top-10 ≤ ${escapeHtml(Concentration.formatShare(data.targets.top10Share))},
        largest ≤ ${escapeHtml(Concentration.formatShare(data.targets.largestCustomerShare))},
        HHI ≤ ${escapeHtml(Concentration.formatHhi(data.targets.hhi))}.
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Revenue</th>
              <th scope="col">Top-10 share</th>
              <th scope="col">Largest share</th>
              <th scope="col">Largest customer</th>
              <th scope="col">HHI</th>
              <th scope="col">Top-10 MoM</th>
              <th scope="col">Largest MoM</th>
              <th scope="col">HHI MoM</th>
              <th scope="col">Vs target</th>
            </tr>
          </thead>
          <tbody>
          ${tableRows}
          </tbody>
        </table>
      </div>
    </section>

    <section class="mix" aria-label="Latest month customer mix">
      <h2 class="section-title">Customer mix — ${escapeHtml(monthLabel(asOf))}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Customer</th>
              <th scope="col">Revenue</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
          ${mixRows}
          </tbody>
        </table>
      </div>
    </section>

    <section class="formulas" id="formulas">
      <h2 class="section-title">Formulas</h2>
      <ul>
        <li>
          <strong>Top-10 share</strong> = (sum of the ten largest customers’ revenue)
          ÷ (total month revenue). Reported as a percent.
        </li>
        <li>
          <strong>Largest-customer share</strong> = (largest single customer’s revenue)
          ÷ (total month revenue).
        </li>
        <li>
          <strong>HHI</strong> (Herfindahl–Hirschman Index) =
          Σ (s<sub>i</sub>)² × 10,000, where s<sub>i</sub> is customer i’s share of
          month revenue on a 0–1 scale. Range is 0–10,000. A single-customer month
          is 10,000; two equal customers are 5,000.
        </li>
        <li>
          <strong>MoM change</strong> = current − previous. Shares are shown in
          percentage points (pp); HHI is shown in index points. The first month
          has no prior period, so MoM is blank.
        </li>
        <li>
          <strong>Targets</strong> are ceilings: a metric is within target when
          its value is ≤ the threshold. Missing or zero-revenue months return
          null rather than NaN or Infinity.
        </li>
      </ul>
    </section>
  </main>

  <footer>
    <p>
      Sample data in <code>data/concentration.json</code>.
      Re-render this page with <code>node scripts/render-static.js</code>.
      JavaScript is not required to read the metrics.
    </p>
  </footer>

  <script src="js/concentration.js" defer></script>
</body>
</html>
`;
}

function main() {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  const html = render(data);
  fs.writeFileSync(OUT_PATH, html);
  console.log("Wrote", path.relative(ROOT, OUT_PATH));
}

main();

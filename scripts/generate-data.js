#!/usr/bin/env node
"use strict";

/**
 * One-off sample data generator. Re-run to refresh data/concentration.json,
 * then run scripts/render-static.js to bake index.html.
 */

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const customers = [
  { id: "northstar", name: "Northstar Logistics" },
  { id: "helix", name: "Helix Biotech" },
  { id: "cascade", name: "Cascade Retail Group" },
  { id: "pinnacle", name: "Pinnacle Energy" },
  { id: "harbor", name: "Harbor & Co" },
  { id: "vertex", name: "Vertex Payments" },
  { id: "lumen", name: "Lumen Health" },
  { id: "ironclad", name: "Ironclad Insurance" },
  { id: "maplewood", name: "Maplewood Foods" },
  { id: "atlas", name: "Atlas Construction" },
  { id: "brightline", name: "Brightline Media" },
  { id: "solstice", name: "Solstice Aviation" },
  { id: "redwood", name: "Redwood Software" },
  { id: "crestview", name: "Crestview Hotels" },
  { id: "oakember", name: "Oak & Ember" },
  { id: "pacific", name: "Pacific Grid" },
];

// Base monthly revenue. Mix of large / mid / long-tail so concentration
// metrics move instead of sitting at a flat equal-share line.
const base = {
  northstar: 410000,
  helix: 355000,
  cascade: 298000,
  pinnacle: 240000,
  harbor: 205000,
  vertex: 188000,
  lumen: 172000,
  ironclad: 155000,
  maplewood: 142000,
  atlas: 128000,
  brightline: 121000,
  solstice: 114000,
  redwood: 98000,
  crestview: 86000,
  oakember: 74000,
  pacific: 68000,
};

const trend = {
  northstar: 0.006,
  helix: -0.004,
  cascade: 0.003,
  pinnacle: 0.001,
  harbor: -0.002,
  vertex: 0.008,
  lumen: 0.002,
  ironclad: -0.001,
  maplewood: 0.001,
  atlas: -0.003,
  brightline: 0.004,
  solstice: 0.002,
  redwood: 0.007,
  crestview: -0.005,
  oakember: 0.003,
  pacific: 0.001,
};

const months = [];
const start = new Date(Date.UTC(2025, 3, 1)); // 2025-04
const rand = mulberry32(20260915);

for (let i = 0; i < 18; i++) {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
  const key =
    d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
  const seasonal = 1 + 0.04 * Math.sin((2 * Math.PI * i) / 12);
  const revenue = {};
  for (const c of customers) {
    const growth = Math.pow(1 + trend[c.id], i);
    const noise = 0.92 + rand() * 0.16;
    // Mid-sample shock: Northstar wins a large contract in 2026-01 (month index 9)
    const shock = c.id === "northstar" && i >= 9 ? 1.18 : 1;
    // Helix churns a product line in 2026-05 (index 13)
    const churn = c.id === "helix" && i >= 13 ? 0.82 : 1;
    const amount = Math.round(base[c.id] * growth * seasonal * noise * shock * churn);
    revenue[c.id] = amount;
  }
  months.push({ month: key, revenue });
}

const data = {
  meta: {
    title: "Customer Revenue Concentration",
    currency: "USD",
    unit: "monthly booked revenue",
    months: 18,
    customers: customers.length,
    asOf: months[months.length - 1].month,
    notes:
      "Sample operating data for a public concentration tracker. Not a live company filing.",
  },
  targets: {
    top10Share: 0.8,
    largestCustomerShare: 0.18,
    hhi: 850,
  },
  customers: customers,
  months: months,
};

const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "..", "data", "concentration.json");
fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
console.log("Wrote", out, "months=", months.length, "customers=", customers.length);

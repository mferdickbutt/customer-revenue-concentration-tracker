#!/usr/bin/env bash
# Customer revenue concentration — unit + first-paint checks.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL=$((FAIL + 1))
}

assert_eq() {
  local got="$1"
  local expect="$2"
  local label="$3"
  if [ "$got" = "$expect" ]; then
    pass "$label"
  else
    fail "$label (got '$got', expected '$expect')"
  fi
}

if [ ! -f js/concentration.js ]; then
  fail "js/concentration.js is present"
  echo "Summary: $PASS passed, $FAIL failed"
  exit 1
fi
pass "js/concentration.js is present"

if [ ! -f data/concentration.json ]; then
  fail "data/concentration.json is present"
else
  pass "data/concentration.json is present"
fi

if [ ! -f index.html ]; then
  fail "index.html is present"
else
  pass "index.html is present"
fi

# --- Node metric tests ---
NODE_OUT="$(node - <<'EOF'
const C = require("./js/concentration.js");
const fs = require("fs");

function fail(msg) {
  console.log("NODE_FAIL " + msg);
  process.exitCode = 1;
}
function ok(msg) {
  console.log("NODE_PASS " + msg);
}

function isNullishMetrics(m, label) {
  if (m.top10Share !== null || m.largestShare !== null || m.hhi !== null) {
    fail(label + " share/hhi should be null");
    return;
  }
  if (Number.isNaN(m.top10Share) || Number.isNaN(m.hhi)) {
    fail(label + " produced NaN");
    return;
  }
  ok(label);
}

function assertNull(value, label) {
  if (value === null) ok(label);
  else fail(label + " expected null, got " + value);
}

function assertClose(value, expect, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(label + " not finite: " + value);
    return;
  }
  if (Math.abs(value - expect) < 1e-9) ok(label);
  else fail(label + " got " + value + " expected " + expect);
}

function hasNaN(obj) {
  return JSON.stringify(obj).includes("NaN") || JSON.stringify(obj).includes("Infinity");
}

isNullishMetrics(C.computeMonthMetrics(null), "null input returns null metrics");
isNullishMetrics(C.computeMonthMetrics(undefined), "undefined input returns null metrics");
isNullishMetrics(C.computeMonthMetrics({}), "empty object returns null shares");
isNullishMetrics(C.computeMonthMetrics({ a: 0, b: 0 }), "zero revenue returns null shares");
isNullishMetrics(C.computeMonthMetrics({ a: -10, b: "nope" }), "non-positive inputs return null shares");

const emptySeries = C.computeSeries([]);
if (Array.isArray(emptySeries) && emptySeries.length === 0) ok("empty series returns []");
else fail("empty series should be []");

const nullSeries = C.computeSeries(null);
if (Array.isArray(nullSeries) && nullSeries.length === 0) ok("null series returns []");
else fail("null series should be []");

const single = C.computeMonthMetrics({ only: 5000 });
assertClose(single.top10Share, 1, "single-customer top-10 share is 100%");
assertClose(single.largestShare, 1, "single-customer largest share is 100%");
assertClose(single.hhi, 10000, "single-customer HHI is 10000");
if (single.largestCustomerId === "only") ok("single-customer id is preserved");
else fail("single-customer id");

const twoEqual = C.computeMonthMetrics({ a: 50, b: 50 });
assertClose(twoEqual.top10Share, 1, "two customers: top-10 is 100%");
assertClose(twoEqual.largestShare, 0.5, "two equal customers: largest is 50%");
assertClose(twoEqual.hhi, 5000, "two equal customers: HHI is 5000");

const nine = {};
for (let i = 0; i < 9; i++) nine["c" + i] = 10;
const nineM = C.computeMonthMetrics(nine);
assertClose(nineM.top10Share, 1, "fewer than 10 customers: top-10 is 100%");

const series = C.computeSeries([
  { month: "2026-01", revenue: { a: 80, b: 20 } },
  { month: "2026-02", revenue: { a: 60, b: 40 } },
]);
assertNull(series[0].mom.top10Share, "first-month MoM is null");
assertClose(series[1].metrics.largestShare, 0.6, "second month largest share");
assertClose(series[1].mom.largestShare, 0.6 - 0.8, "MoM largest-share delta");

const vs = C.compareToTargets(single, { top10Share: 0.8, largestCustomerShare: 0.2, hhi: 1500 });
if (vs.top10Share.withinTarget === false && vs.hhi.withinTarget === false) {
  ok("single-customer breaches top-10 and HHI ceilings");
} else {
  fail("target comparison for single-customer");
}

const vsNull = C.compareToTargets(null, null);
if (vsNull.top10Share.withinTarget === null && vsNull.hhi.value === null) {
  ok("null target comparison returns nulls");
} else {
  fail("null target comparison");
}

if (!hasNaN(C.computeMonthMetrics(null)) && !hasNaN(C.computeSeries([null, { revenue: {} }]))) {
  ok("null/empty paths serialize without NaN or Infinity");
} else {
  fail("NaN/Infinity leaked into serialized metrics");
}

const inf = C.computeMonthMetrics({ a: Number.POSITIVE_INFINITY });
if (inf.top10Share === null && inf.hhi === null) ok("Infinity revenue is ignored, not propagated");
else fail("Infinity revenue handling");

const nanIn = C.computeMonthMetrics({ a: Number.NaN, b: 10 });
if (nanIn.largestShare === 1 && Number.isFinite(nanIn.hhi)) ok("NaN revenue entries are dropped");
else fail("NaN revenue handling");

const data = JSON.parse(fs.readFileSync("./data/concentration.json", "utf8"));
if (Array.isArray(data.months) && data.months.length === 18) ok("sample data has exactly 18 months");
else fail("month count " + (data.months && data.months.length));
if (Array.isArray(data.customers) && data.customers.length >= 12 && data.customers.length <= 20) {
  ok("sample data has 12–20 named customers");
} else {
  fail("customer count");
}
if (
  data.targets &&
  typeof data.targets.top10Share === "number" &&
  typeof data.targets.largestCustomerShare === "number" &&
  typeof data.targets.hhi === "number"
) {
  ok("sample data includes target thresholds");
} else {
  fail("targets");
}

const full = C.computeSeries(data.months);
const latest = C.latestSnapshot(full);
if (latest && C.isFiniteNumber(latest.metrics.top10Share) && C.isFiniteNumber(latest.metrics.hhi)) {
  ok("latest sample month has finite concentration metrics");
} else {
  fail("latest sample metrics");
}
console.log("LATEST_TOP10 " + C.formatShare(latest.metrics.top10Share));
console.log("LATEST_LARGEST " + C.formatShare(latest.metrics.largestShare));
console.log("LATEST_HHI " + C.formatHhi(latest.metrics.hhi));
console.log("LATEST_MONTH " + latest.month);
EOF
)"

echo "$NODE_OUT" | while IFS= read -r line; do
  case "$line" in
    NODE_PASS*) echo "PASS: ${line#NODE_PASS }" ;;
    NODE_FAIL*) echo "FAIL: ${line#NODE_FAIL }" ;;
  esac
done

NODE_PASS_COUNT=$(printf '%s\n' "$NODE_OUT" | grep -c '^NODE_PASS ' || true)
NODE_FAIL_COUNT=$(printf '%s\n' "$NODE_OUT" | grep -c '^NODE_FAIL ' || true)
PASS=$((PASS + NODE_PASS_COUNT))
FAIL=$((FAIL + NODE_FAIL_COUNT))

LATEST_TOP10=$(printf '%s\n' "$NODE_OUT" | awk '/^LATEST_TOP10 /{print $2}')
LATEST_LARGEST=$(printf '%s\n' "$NODE_OUT" | awk '/^LATEST_LARGEST /{print $2}')
LATEST_HHI=$(printf '%s\n' "$NODE_OUT" | awk '/^LATEST_HHI /{print $2}')
LATEST_MONTH=$(printf '%s\n' "$NODE_OUT" | awk '/^LATEST_MONTH /{print $2}')

# --- Static first-paint HTML ---
HTML_PATH="$ROOT/index.html"
if command -v curl >/dev/null 2>&1; then
  HTML="$(curl -sL "file://${HTML_PATH}" 2>/dev/null || true)"
fi
if [ -z "${HTML:-}" ]; then
  HTML="$(cat "$HTML_PATH")"
  pass "static HTML readable via cat fallback"
else
  pass "static HTML readable via curl -sL"
fi

echo "$HTML" | grep -qi "Loading" && fail "static HTML has no Loading shell" || pass "static HTML has no Loading shell"
echo "$HTML" | grep -q "Top-10 share" && pass "static HTML includes Top-10 share" || fail "static HTML includes Top-10 share"
echo "$HTML" | grep -q "Largest-customer share\|Largest share" && pass "static HTML includes largest-customer share" || fail "static HTML includes largest-customer share"
echo "$HTML" | grep -q "HHI" && pass "static HTML includes HHI" || fail "static HTML includes HHI"

if [ -n "${LATEST_TOP10:-}" ] && echo "$HTML" | grep -q "$LATEST_TOP10"; then
  pass "static HTML bakes latest top-10 share ($LATEST_TOP10)"
else
  fail "static HTML bakes latest top-10 share ($LATEST_TOP10)"
fi
if [ -n "${LATEST_LARGEST:-}" ] && echo "$HTML" | grep -q "$LATEST_LARGEST"; then
  pass "static HTML bakes latest largest share ($LATEST_LARGEST)"
else
  fail "static HTML bakes latest largest share ($LATEST_LARGEST)"
fi
if [ -n "${LATEST_HHI:-}" ] && echo "$HTML" | grep -q "$LATEST_HHI"; then
  pass "static HTML bakes latest HHI ($LATEST_HHI)"
else
  fail "static HTML bakes latest HHI ($LATEST_HHI)"
fi

MONTH_ROWS=$(echo "$HTML" | grep -c 'data-month="' || true)
if [ "$MONTH_ROWS" -eq 18 ]; then
  pass "static HTML has 18 month rows"
else
  fail "static HTML has 18 month rows (got $MONTH_ROWS)"
fi

echo "$HTML" | grep -q "2025-04" && pass "static HTML includes first sample month 2025-04" || fail "first month row"
echo "$HTML" | grep -q "2026-09" && pass "static HTML includes latest sample month 2026-09" || fail "latest month row"

if [ -n "${LATEST_MONTH:-}" ] && echo "$HTML" | grep -q "$LATEST_MONTH"; then
  pass "static HTML names the latest month ($LATEST_MONTH)"
else
  fail "static HTML names the latest month"
fi

echo "$HTML" | grep -q "<noscript>" && fail "static HTML does not hide metrics behind noscript" || pass "static HTML does not hide metrics behind noscript"
echo "$HTML" | grep -qi "please enable javascript" && fail "static HTML does not ask for JavaScript" || pass "static HTML does not ask for JavaScript"

# Re-render should be deterministic vs current file
if command -v node >/dev/null 2>&1; then
  TMP_HTML="$(mktemp)"
  node "$ROOT/scripts/render-static.js" >/dev/null
  # render writes index.html; compare after copying expected from git-less snapshot
  # Instead: ensure renderer exits 0 and still contains baked numbers
  if grep -q "$LATEST_TOP10" "$HTML_PATH" && grep -q "$LATEST_HHI" "$HTML_PATH"; then
    pass "render-static.js keeps baked metrics in index.html"
  else
    fail "render-static.js keeps baked metrics in index.html"
  fi
  rm -f "$TMP_HTML"
fi

echo "Summary: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ] && [ "$PASS" -ge 12 ]; then
  exit 0
fi
if [ "$FAIL" -eq 0 ]; then
  echo "FAIL: expected at least 12 PASS lines, got $PASS"
  exit 1
fi
exit 1

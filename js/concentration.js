/**
 * Customer revenue concentration metrics.
 *
 * Works in the browser (global `Concentration`) and in Node (`module.exports`).
 *
 * HHI formula (0–10,000 scale):
 *   HHI = Σ (s_i)² × 10,000
 * where s_i is customer i's share of that month's revenue (0–1).
 *
 * Unsafe inputs (null, empty, zero total revenue) return null for share/HHI
 * metrics — never NaN or Infinity.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Concentration = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var EMPTY_METRICS = Object.freeze({
    total: null,
    customerCount: 0,
    top10Share: null,
    largestShare: null,
    hhi: null,
    largestCustomerId: null,
  });

  function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function nullIfUnsafe(n) {
    return isFiniteNumber(n) ? n : null;
  }

  /**
   * Positive finite revenues only. Negatives, NaN, and non-numbers are dropped.
   */
  function positiveRevenues(revenueByCustomer) {
    if (revenueByCustomer == null || typeof revenueByCustomer !== "object") {
      return null;
    }
    var rows = [];
    var keys = Object.keys(revenueByCustomer);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var raw = revenueByCustomer[id];
      var value = typeof raw === "number" ? raw : Number(raw);
      if (isFiniteNumber(value) && value > 0) {
        rows.push({ id: id, revenue: value });
      }
    }
    rows.sort(function (a, b) {
      return b.revenue - a.revenue;
    });
    return rows;
  }

  /**
   * Concentration metrics for a single month of { customerId: revenue }.
   * Zero-revenue, empty, and null inputs yield null share/HHI fields.
   */
  function computeMonthMetrics(revenueByCustomer) {
    var rows = positiveRevenues(revenueByCustomer);
    if (rows == null) {
      return {
        total: null,
        customerCount: 0,
        top10Share: null,
        largestShare: null,
        hhi: null,
        largestCustomerId: null,
      };
    }

    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      total += rows[i].revenue;
    }

    if (rows.length === 0 || total <= 0) {
      return {
        total: 0,
        customerCount: rows.length,
        top10Share: null,
        largestShare: null,
        hhi: null,
        largestCustomerId: null,
      };
    }

    var top10Sum = 0;
    var limit = Math.min(10, rows.length);
    for (var t = 0; t < limit; t++) {
      top10Sum += rows[t].revenue;
    }

    var hhi = 0;
    for (var h = 0; h < rows.length; h++) {
      var share = rows[h].revenue / total;
      hhi += share * share * 10000;
    }

    var top10Share = top10Sum / total;
    var largestShare = rows[0].revenue / total;

    return {
      total: total,
      customerCount: rows.length,
      top10Share: nullIfUnsafe(top10Share),
      largestShare: nullIfUnsafe(largestShare),
      hhi: nullIfUnsafe(hhi),
      largestCustomerId: rows[0].id,
    };
  }

  function delta(current, previous) {
    if (!isFiniteNumber(current) || !isFiniteNumber(previous)) {
      return null;
    }
    var change = current - previous;
    return nullIfUnsafe(change);
  }

  /**
   * Walk a month series in order and attach MoM deltas.
   * Empty/null series → [].
   */
  function computeSeries(months) {
    if (months == null || !Array.isArray(months) || months.length === 0) {
      return [];
    }

    var out = [];
    var prev = null;
    for (var i = 0; i < months.length; i++) {
      var month = months[i];
      if (month == null || typeof month !== "object") {
        out.push({
          month: null,
          revenue: null,
          metrics: computeMonthMetrics(null),
          mom: { top10Share: null, largestShare: null, hhi: null },
        });
        prev = null;
        continue;
      }

      var metrics = computeMonthMetrics(month.revenue);
      var mom = {
        top10Share: prev ? delta(metrics.top10Share, prev.top10Share) : null,
        largestShare: prev ? delta(metrics.largestShare, prev.largestShare) : null,
        hhi: prev ? delta(metrics.hhi, prev.hhi) : null,
      };
      out.push({
        month: month.month == null ? null : String(month.month),
        revenue: month.revenue,
        metrics: metrics,
        mom: mom,
      });
      prev = metrics;
    }
    return out;
  }

  function compareField(value, target) {
    if (!isFiniteNumber(value) || !isFiniteNumber(target)) {
      return {
        value: isFiniteNumber(value) ? value : null,
        target: isFiniteNumber(target) ? target : null,
        withinTarget: null,
        delta: null,
      };
    }
    return {
      value: value,
      target: target,
      withinTarget: value <= target,
      delta: nullIfUnsafe(value - target),
    };
  }

  /**
   * Ceiling comparisons: within target when metric ≤ threshold.
   */
  function compareToTargets(metrics, targets) {
    if (metrics == null || typeof metrics !== "object" || targets == null || typeof targets !== "object") {
      return {
        top10Share: compareField(null, null),
        largestShare: compareField(null, null),
        hhi: compareField(null, null),
      };
    }
    var largestTarget =
      targets.largestCustomerShare != null ? targets.largestCustomerShare : targets.largestShare;
    return {
      top10Share: compareField(metrics.top10Share, targets.top10Share),
      largestShare: compareField(metrics.largestShare, largestTarget),
      hhi: compareField(metrics.hhi, targets.hhi),
    };
  }

  function latestSnapshot(series) {
    if (!Array.isArray(series) || series.length === 0) {
      return null;
    }
    return series[series.length - 1];
  }

  function formatShare(share) {
    if (!isFiniteNumber(share)) {
      return "—";
    }
    return (share * 100).toFixed(1) + "%";
  }

  function formatHhi(hhi) {
    if (!isFiniteNumber(hhi)) {
      return "—";
    }
    return String(Math.round(hhi));
  }

  function formatMomShare(change) {
    if (!isFiniteNumber(change)) {
      return "—";
    }
    var pp = change * 100;
    var sign = pp > 0 ? "+" : "";
    return sign + pp.toFixed(1) + " pp";
  }

  function formatMomHhi(change) {
    if (!isFiniteNumber(change)) {
      return "—";
    }
    var rounded = Math.round(change);
    var sign = rounded > 0 ? "+" : "";
    return sign + String(rounded);
  }

  function formatMoney(amount) {
    if (!isFiniteNumber(amount)) {
      return "—";
    }
    return "$" + Math.round(amount).toLocaleString("en-US");
  }

  return {
    EMPTY_METRICS: EMPTY_METRICS,
    isFiniteNumber: isFiniteNumber,
    computeMonthMetrics: computeMonthMetrics,
    computeSeries: computeSeries,
    compareToTargets: compareToTargets,
    latestSnapshot: latestSnapshot,
    formatShare: formatShare,
    formatHhi: formatHhi,
    formatMomShare: formatMomShare,
    formatMomHhi: formatMomHhi,
    formatMoney: formatMoney,
  };
});

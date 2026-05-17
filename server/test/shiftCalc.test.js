"use strict";
/**
 * Unit tests for shift calculation utilities.
 * Run: node --test test/shiftCalc.test.js
 * Requires Node 18+.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { computeShiftMetrics, parseTimeHHMM, getTimeOfDayMinutes } = require("../src/utils/shiftCalc");

// Minimal shift fixture factory
function shift(overrides = {}) {
  return {
    start_time: "08:00",
    end_time: "17:00",
    grace_minutes: 0,
    early_out_grace_minutes: 0,
    overtime_after_minutes: 0,
    ...overrides
  };
}

// Convert "HH:MM" to minutes-from-midnight for use in computeShiftMetrics
function hhmm(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

describe("parseTimeHHMM", () => {
  test("parses HH:MM correctly", () => {
    assert.equal(parseTimeHHMM("08:30"), 510);
    assert.equal(parseTimeHHMM("00:00"), 0);
    assert.equal(parseTimeHHMM("23:59"), 1439);
  });
  test("returns null for invalid input", () => {
    assert.equal(parseTimeHHMM(null), null);
    assert.equal(parseTimeHHMM(""), null);
    assert.equal(parseTimeHHMM("bad"), null);
  });
});

describe("getTimeOfDayMinutes", () => {
  test("extracts UTC minutes-from-midnight from ISO string", () => {
    assert.equal(getTimeOfDayMinutes("2024-01-15T08:30:00.000Z"), 510);
    assert.equal(getTimeOfDayMinutes("2024-01-15T00:00:00.000Z"), 0);
  });
  test("returns null for invalid input", () => {
    assert.equal(getTimeOfDayMinutes(null), null);
    assert.equal(getTimeOfDayMinutes("not-a-date"), null);
  });
});

describe("computeShiftMetrics — standard shift 08:00–17:00", () => {
  const s = shift();

  test("on-time arrival, no checkout → Present, 0 late", () => {
    const r = computeShiftMetrics(s, hhmm("08:00"), null);
    assert.equal(r.lateMinutes, 0);
    assert.equal(r.status, "Present");
  });

  test("within grace → not late", () => {
    const r = computeShiftMetrics(shift({ grace_minutes: 10 }), hhmm("08:05"), null);
    assert.equal(r.lateMinutes, 0);
  });

  test("beyond grace → late by correct minutes", () => {
    const r = computeShiftMetrics(shift({ grace_minutes: 10 }), hhmm("08:15"), null);
    assert.equal(r.lateMinutes, 5);
    assert.equal(r.status, "Late");
  });

  test("exact on time → 0 late", () => {
    const r = computeShiftMetrics(s, hhmm("08:00"), hhmm("17:00"));
    assert.equal(r.lateMinutes, 0);
    assert.equal(r.earlyOutMinutes, 0);
    assert.equal(r.overtimeMinutes, 0);
    assert.equal(r.status, "Present");
  });

  test("early out → earlyOutMinutes correct", () => {
    const r = computeShiftMetrics(s, hhmm("08:00"), hhmm("16:30"));
    assert.equal(r.earlyOutMinutes, 30);
    assert.equal(r.status, "Early Out");
  });

  test("early out within grace → not early", () => {
    const r = computeShiftMetrics(shift({ early_out_grace_minutes: 10 }), hhmm("08:00"), hhmm("16:55"));
    assert.equal(r.earlyOutMinutes, 0);
  });

  test("overtime → overtimeMinutes correct", () => {
    // OT starts after 60 min buffer → checkout at 18:30 = 30 min OT
    const r = computeShiftMetrics(shift({ overtime_after_minutes: 60 }), hhmm("08:00"), hhmm("18:30"));
    assert.equal(r.overtimeMinutes, 30);
    assert.equal(r.status, "Overtime");
  });

  test("no overtime within buffer", () => {
    const r = computeShiftMetrics(shift({ overtime_after_minutes: 60 }), hhmm("08:00"), hhmm("17:45"));
    assert.equal(r.overtimeMinutes, 0);
  });
});

describe("computeShiftMetrics — overnight shift 22:00–06:00", () => {
  const nightShift = shift({ start_time: "22:00", end_time: "06:00" });

  test("on-time arrival, on-time checkout → Present", () => {
    const r = computeShiftMetrics(nightShift, hhmm("22:00"), hhmm("06:00"));
    assert.equal(r.lateMinutes, 0);
    assert.equal(r.earlyOutMinutes, 0);
    assert.equal(r.status, "Present");
  });

  test("early checkout → early out minutes", () => {
    // checkout at 05:50 → 10 min early
    const r = computeShiftMetrics(nightShift, hhmm("22:00"), hhmm("05:50"));
    assert.equal(r.earlyOutMinutes, 10);
  });
});

describe("computeShiftMetrics — edge cases", () => {
  test("null shift → defaults", () => {
    const r = computeShiftMetrics(null, hhmm("08:30"), null);
    assert.equal(r.lateMinutes, 0);
    assert.equal(r.overtimeMinutes, 0);
    assert.equal(r.status, "Present");
  });

  test("null checkIn → defaults", () => {
    const r = computeShiftMetrics(shift(), null, null);
    assert.equal(r.lateMinutes, 0);
  });
});

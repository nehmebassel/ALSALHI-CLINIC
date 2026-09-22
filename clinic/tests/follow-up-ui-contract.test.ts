import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const followUp = fs.readFileSync(new URL("../app/patient/follow-up-delta-step.tsx", import.meta.url), "utf8");
const globalCss = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const patientJourneyCss = fs.readFileSync(new URL("../app/patient/patient-journey.module.css", import.meta.url), "utf8");
const picker = fs.readFileSync(new URL("../app/patient/clinical-date-picker.tsx", import.meta.url), "utf8");

test("patient follow-up UI does not expose internal longitudinal implementation copy", () => {
  for (const phrase of [
    "نستعيد الحالة السابقة بدل إعادة الاستبيان",
    "سجل طبيب متاح",
    "علاجات/أدوية مسجلة",
    "إجراءات سابقة مسجلة",
    "physicianContextAvailable",
  ]) {
    assert.equal(followUp.includes(phrase), false, phrase);
  }
});

test("follow-up uses domain cards and legacy monolithic v1.7 presentation is removed", () => {
  assert.equal(followUp.includes('className="follow-up-domain-list"'), true);
  assert.equal(followUp.includes('className="follow-up-change-card"'), false);
  assert.equal(patientJourneyCss.includes(".scope :global(.follow-up-domain-list)"), true);
  assert.equal(patientJourneyCss.includes(".scope :global(.follow-up-change-card)"), false);
});

test("RTL eyebrow does not force English uppercase tracking", () => {
  assert.match(globalCss, /\[dir="rtl"\] \.eyebrow\s*\{[\s\S]*?letter-spacing:\s*0;[\s\S]*?text-transform:\s*none;/);
});

test("date calendar switch is explicit, styled, and exposes selected state", () => {
  assert.equal(picker.includes('className="calendar-toggle"'), true);
  assert.equal(picker.includes('aria-pressed={calendar === "GREGORIAN"}'), true);
  assert.equal(picker.includes('aria-pressed={calendar === "HIJRI"}'), true);
  assert.equal(patientJourneyCss.includes(".scope :global(.calendar-toggle)"), true);
  assert.equal(picker.includes("convertClinicalApproxDate"), true);
});

test("Arabic clinical scale labels keep RTL reading direction", () => {
  const patientJourney = fs.readFileSync(new URL("../app/patient/patient-journey.tsx", import.meta.url), "utf8");
  assert.equal(followUp.includes('dir={isAr ? "rtl" : "ltr"} aria-pressed={metrics[metric.code] === index}'), true);
  assert.equal(patientJourney.includes('dir={locale === "ar" ? "rtl" : "ltr"} aria-pressed={String(value) === String(index)}'), true);
});

test("follow-up purpose choices expose selected state and patient banner uses a simple readable flow", () => {
  const patientJourney = fs.readFileSync(new URL("../app/patient/patient-journey.tsx", import.meta.url), "utf8");
  assert.equal(patientJourney.includes("aria-pressed={selected}"), true);
  assert.equal(patientJourney.includes('aria-pressed={context.intent === "NEW_CONCERN"}'), true);
  assert.match(patientJourneyCss, /\.scope :global\(\.follow-up-visit-banner\)\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/);
});


test("Arabic 0-5 clinical scales run from right to left while English remains left to right", () => {
  const source = fs.readFileSync(new URL("../app/patient/patient-journey.tsx", import.meta.url), "utf8");
  assert.match(source, /className="scale-choice-grid" dir=\{locale === "ar" \? "rtl" : "ltr"\}/);
  assert.match(source, /className="scale-row" dir=\{locale === "ar" \? "rtl" : "ltr"\}/);
});

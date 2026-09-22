import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../app/generated/prisma/client";
import { buildStructuredLabelCatalog, pickLocalized, presentClinicalValue } from "../../lib/physician/presentation";
import { getPhysicianPatientWorkspace } from "../../lib/physician/read-model";
import type { PhysicianInterviewQuestion, PhysicianPatientWorkspaceData } from "../../lib/physician/types";

const SYNTHETIC_SESSION_PREFIX = "synthetic-";
const ENUM_TOKEN = /^[A-Z][A-Z0-9_]{3,}$/;
const RAW_IMPLEMENTATION_TOKEN = /\b(?:RV|AP|LASER|Q|P01|SYN)_[A-Z0-9_]+\b/;
const INTERNAL_KEYS = new Set(["id", "synthetic", "sourceResponseId", "sourceQuestionCode", "sourceScopeKey", "sourceItemIndex"]);
const FREE_TEXT_KEYS = new Set(["name", "details", "notes", "otherText", "complicationText", "areaText", "areaOther", "typeText", "changeDescription", "desiredResult", "itemLabel"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function structuredEnumCandidates(question: PhysicianInterviewQuestion): Set<string> {
  const found = new Set<string>();
  const source = question.repeatableItems.length > 0 ? question.repeatableItems : question.value;

  function visit(value: unknown, depth = 0, parentKey = ""): void {
    if (typeof value === "string") {
      const topLevelFreeText = depth === 0
        && question.repeatableItems.length === 0
        && (question.responseType === "TEXT" || question.responseType === "LONG_TEXT");
      if (!topLevelFreeText && !FREE_TEXT_KEYS.has(parentKey) && ENUM_TOKEN.test(value)) found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1, parentKey));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_KEYS.has(key) || key.startsWith("__")) continue;
      visit(nested, depth + 1, key);
    }
  }

  visit(source);
  return found;
}

function collectWorkspacePresentationText(data: PhysicianPatientWorkspaceData, locale: "ar" | "en"): string[] {
  const texts: string[] = [];
  const add = (value: string | undefined) => { if (value) texts.push(value); };
  const addLocalized = (value: { ar: string; en: string } | undefined) => { if (value) add(pickLocalized(value, locale)); };

  addLocalized(data.caseSummary.visitReason);
  data.caseSummary.additionalReasons.forEach(addLocalized);
  data.caseSummary.currentConcern.forEach(addLocalized);
  data.caseSummary.needsAttention.forEach(addLocalized);
  addLocalized(data.caseSummary.latestDiagnosis);
  data.clinicalStorySummary.forEach(addLocalized);
  for (const section of data.clinicalStory) {
    addLocalized(section.title);
    addLocalized(section.description);
    for (const group of section.groups) {
      addLocalized(group.title);
      for (const item of group.items) {
        addLocalized(item.label);
        item.entries.forEach((entry) => entry.values.forEach(addLocalized));
      }
    }
  }
  for (const section of data.followUpSections) {
    addLocalized(section.title);
    for (const fact of section.facts) {
      addLocalized(fact.label);
      fact.values.forEach(addLocalized);
    }
  }
  for (const episode of data.episodes) {
    addLocalized(episode.primary);
    for (const visit of episode.visits) {
      addLocalized(visit.primary);
      visit.additional.forEach(addLocalized);
      addLocalized(visit.diagnosis);
    }
  }
  for (const event of data.timeline) {
    addLocalized(event.title);
    addLocalized(event.description);
  }
  data.hairHistory.items.forEach((item) => addLocalized(item.label));
  return texts;
}

test("AEP-006/AEP-007 traverses all 36 persisted physician workspaces with direct clinical answers and no raw structured enums", async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required for the persisted-workspace localization audit.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const clinicScope = await prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } });
    const patients = await prisma.patient.findMany({
      where: {
        interviewInvitations: {
          some: { session: { is: { sessionTokenHash: { startsWith: SYNTHETIC_SESSION_PREFIX } } } },
        },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(patients.length, 36, "The persisted synthetic physician cohort must contain exactly 36 workspaces.");

    let localeTraversals = 0;
    const storyItemCounts: number[] = [];
    for (const [patientIndex, patient] of patients.entries()) {
      const workspace = await getPhysicianPatientWorkspace(prisma, clinicScope.id, patient.id);
      assert.ok(workspace, `Synthetic workspace ${patientIndex + 1} could not be built.`);
      assert.deepEqual(
        workspace.presentationAuditSignals,
        [],
        `Synthetic workspace ${patientIndex + 1} has an unmapped follow-up structured value.`,
      );
      const questions = [...workspace.initialQuestions, ...workspace.reviewQuestions];
      const catalog = buildStructuredLabelCatalog(questions);
      const workspaceCandidates = new Set<string>();
      questions.forEach((question) => structuredEnumCandidates(question).forEach((token) => workspaceCandidates.add(token)));
      const storyItems = workspace.clinicalStory.flatMap((section) => section.groups.flatMap((group) => group.items));
      storyItemCounts.push(storyItems.length);
      assert.ok(workspace.clinicalStory.length > 0 && workspace.clinicalStory.length <= 15, `Workspace ${patientIndex + 1} must suppress empty story sections.`);
      assert.ok(workspace.clinicalStory.every((section) => section.groups.length > 0 && section.groups.every((group) => group.items.length > 0)), `Workspace ${patientIndex + 1} rendered an empty Clinical Story section or subgroup.`);
      assert.ok(storyItems.every((item) => item.entries.length > 0 && item.entries.every((entry) => entry.values.length > 0)), `Workspace ${patientIndex + 1} has a heading without its recorded clinical content.`);
      assert.ok(storyItems.every((item) => item.sourceRefs.length > 0), `Workspace ${patientIndex + 1} has a Clinical Story item without provenance.`);

      for (const locale of ["ar", "en"] as const) {
        localeTraversals += 1;
        const visibleText = collectWorkspacePresentationText(workspace, locale);
        const questionLabels = new Set(questions
          .map((question) => pickLocalized(question.text, locale))
          .filter((label) => /[؟?]\s*$/.test(label) || /^(?:هل|ما|متى|أين|كيف|أي|كم|what|when|where|how|which|do|does|did|have|has|is|are|would)\b/i.test(label)));
        for (const item of storyItems) {
          assert.equal(
            questionLabels.has(pickLocalized(item.label, locale)),
            false,
            `Workspace ${patientIndex + 1} ${locale} replays a questionnaire prompt as a Clinical Story heading.`,
          );
        }
        for (const question of questions) {
          const presented = presentClinicalValue(question, locale, catalog);
          assert.deepEqual(
            presented.auditSignals,
            [],
            `Workspace ${patientIndex + 1} ${locale} has a missing structured mapping for ${question.code}.`,
          );
          const rendered = presented.lines.join("\n");
          assert.doesNotMatch(rendered, RAW_IMPLEMENTATION_TOKEN, `Raw implementation token in ${question.code} (${locale}).`);
          for (const token of structuredEnumCandidates(question)) {
            assert.doesNotMatch(
              rendered,
              new RegExp(`\\b${escapeRegExp(token)}\\b`),
              `Raw structured token ${token} in ${question.code} (${locale}).`,
            );
          }
          visibleText.push(...presented.lines);
        }

        const completePresentation = visibleText.join("\n");
        assert.doesNotMatch(completePresentation, RAW_IMPLEMENTATION_TOKEN, `Raw implementation token in workspace ${patientIndex + 1} (${locale}).`);
        for (const token of workspaceCandidates) {
          assert.doesNotMatch(
            completePresentation,
            new RegExp(`\\b${escapeRegExp(token)}\\b`),
            `Raw structured token ${token} in workspace ${patientIndex + 1} (${locale}).`,
          );
        }
      }
    }
    assert.equal(localeTraversals, 72);
    assert.ok(storyItemCounts[5] > 20, "Dense corrected case 6 must preserve its complete recorded answer set.");
    assert.ok(storyItemCounts[11] > 20, "Dense corrected case 12 must preserve its complete recorded answer set.");
    assert.ok(Math.min(...storyItemCounts) <= 6, "At least one sparse persisted case must remain compact rather than receiving filler sections.");
  } finally {
    await prisma.$disconnect();
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PrismaClient } from "../app/generated/prisma/client";
import type { AuthenticatedActor } from "../lib/auth/authorization";
import {
  buildHospitalSummaryClinicalContent,
  loadHospitalVisitSummary,
  type HospitalSummaryCanonicalRead,
} from "../lib/physician/hospital-summary";

const actor: AuthenticatedActor = {
  actorType: "AUTHENTICATED_USER",
  userId: "10000000-0000-4000-8000-000000000001",
  userName: "Dr Example",
  role: "PHYSICIAN",
  clinicScopeId: "20000000-0000-4000-8000-000000000001",
  clinicDeviceId: null,
  authenticatedSessionId: "30000000-0000-4000-8000-000000000001",
};

function canonical(
  overrides: Partial<HospitalSummaryCanonicalRead> = {},
): HospitalSummaryCanonicalRead {
  return {
    status: "FINALIZED",
    visitOccurredAt: "2026-09-07T09:15:00.000Z",
    finalizedAt: "2026-09-07T09:45:00.000Z",
    canonicalClinicalData: {},
    visitDecisions: { diagnoses: [], treatments: [], procedures: [] },
    effectivePhysicianState: {
      diagnoses: [],
      treatmentCourses: [],
      procedurePlans: [],
      performedProcedures: [],
    },
    ...overrides,
  };
}

test("Hospital Summary renders selected-visit content and referenced stable identities only", () => {
  const content = buildHospitalSummaryClinicalContent(canonical({
    visitDecisions: {
      diagnoses: [
        { diagnosisId: "D1", action: "ADD", text: "  Androgenetic alopecia\nLudwig pattern  " },
        { diagnosisId: "D2", action: "RESOLVE" },
      ],
      treatments: [
        { treatmentCourseId: "T1", action: "START", name: "Oral minoxidil", regimenText: "1.25 mg nightly", noteText: "Monitor blood pressure." },
        { treatmentCourseId: "T2", action: "CONTINUE_EXISTING", noteText: "Continue as tolerated." },
        { treatmentCourseId: "T3", action: "MODIFY", regimenText: "Once daily" },
        { treatmentCourseId: "T4", action: "STOP" },
      ],
      procedures: [
        { procedurePlanId: "P1", action: "PLAN", procedureCode: "PRP", plannedDate: "2026-09-20", noteText: "Three sessions." },
        { procedurePlanId: "P2", action: "PERFORM", procedureCode: "OTHER", otherProcedureText: "  Physician-authored procedure  ", performedDate: "2026-09-07" },
        { procedurePlanId: "P3", action: "CANCEL_OR_DEFER", noteText: "Deferred by physician." },
      ],
    },
    effectivePhysicianState: {
      diagnoses: [
        { diagnosisId: "D1", text: "LEAKED FUTURE DIAGNOSIS", status: "ACTIVE" },
        { diagnosisId: "D2", text: "LEAKED RESOLVED DIAGNOSIS", status: "RESOLVED" },
      ],
      treatmentCourses: [
        { treatmentCourseId: "T1", name: "LEAKED T1 NAME", regimenText: "LEAKED T1 REGIMEN", status: "ACTIVE" },
        { treatmentCourseId: "T2", name: "LEAKED T2 NAME", regimenText: "LEAKED VISIT 3 REGIMEN", status: "ACTIVE" },
        { treatmentCourseId: "T3", name: "LEAKED T3 NAME", regimenText: "LEAKED T3 REGIMEN", status: "ACTIVE" },
        { treatmentCourseId: "T4", name: "LEAKED T4 NAME", regimenText: "LEAKED T4 REGIMEN", status: "STOPPED" },
      ],
      procedurePlans: [
        { procedurePlanId: "P1", procedureCode: "MICRONEEDLING", plannedDate: "2099-01-01", status: "OPEN" },
        { procedurePlanId: "P3", procedureCode: "OTHER", otherProcedureText: "LEAKED PROCEDURE", plannedDate: "2099-02-01", status: "CANCELLED_OR_DEFERRED" },
      ],
      performedProcedures: [],
    },
  }), {
    treatmentCourses: [
      { treatmentCourseId: "T2", name: "Topical minoxidil" },
      { treatmentCourseId: "T3", name: "Ketoconazole shampoo" },
      { treatmentCourseId: "T4", name: "Biotin" },
    ],
    procedurePlans: [
      { procedurePlanId: "P3", procedureCode: "MICRONEEDLING" },
    ],
  });

  assert.deepEqual(content.diagnoses.map(({ status, title }) => ({ status, title })), [
    { status: "New diagnosis", title: "  Androgenetic alopecia\nLudwig pattern  " },
  ]);
  assert.deepEqual(content.treatments, [
    {
      status: "Started",
      title: "Oral minoxidil",
      details: [
        { label: "Regimen", value: "1.25 mg nightly" },
        { label: "Physician note", value: "Monitor blood pressure." },
      ],
    },
    {
      status: "Continued",
      title: "Topical minoxidil",
      details: [{ label: "Physician note", value: "Continue as tolerated." }],
    },
    {
      status: "Modified",
      title: "Ketoconazole shampoo",
      details: [{ label: "Regimen", value: "Once daily" }],
    },
    { status: "Stopped", title: "Biotin", details: [] },
  ]);
  assert.deepEqual(content.procedures, [
    {
      status: "Planned",
      title: "PRP / Platelet-Rich Plasma",
      details: [
        { label: "Planned date", value: "2026-09-20" },
        { label: "Physician note", value: "Three sessions." },
      ],
    },
    {
      status: "Performed",
      title: "  Physician-authored procedure  ",
      details: [{ label: "Performed date", value: "2026-09-07" }],
    },
    {
      status: "Cancelled or deferred",
      title: "Microneedling",
      details: [{ label: "Physician note", value: "Deferred by physician." }],
    },
  ]);
  assert.equal(JSON.stringify(content).includes("LEAKED"), false);
  assert.equal(JSON.stringify(content).includes("2099-"), false);
});

test("DEMO-001 Visit 2 keeps treatment identity but omits Visit 1 regimen", () => {
  const content = buildHospitalSummaryClinicalContent(canonical({
    visitDecisions: {
      diagnoses: [],
      treatments: [{
        treatmentCourseId: "DEMO-001-MINOXIDIL",
        action: "CONTINUE_EXISTING",
        noteText: "تحمل جيد؛ الاستمرار دون تغيير.",
      }],
      procedures: [],
    },
    effectivePhysicianState: {
      diagnoses: [],
      treatmentCourses: [{
        treatmentCourseId: "DEMO-001-MINOXIDIL",
        name: "مينوكسيديل موضعي 5%",
        regimenText: "1 مل مساءً على المناطق المتأثرة",
        status: "ACTIVE",
      }],
      procedurePlans: [],
      performedProcedures: [],
    },
  }), {
    treatmentCourses: [{
      treatmentCourseId: "DEMO-001-MINOXIDIL",
      name: "مينوكسيديل موضعي 5%",
    }],
    procedurePlans: [],
  });

  assert.deepEqual(content.treatments, [{
    status: "Continued",
    title: "مينوكسيديل موضعي 5%",
    details: [{
      label: "Physician note",
      value: "تحمل جيد؛ الاستمرار دون تغيير.",
    }],
  }]);
  assert.equal(JSON.stringify(content).includes("1 مل مساءً"), false);
});

test("DEMO-002 Visit 2 omits earlier and later mutable details", () => {
  const content = buildHospitalSummaryClinicalContent(canonical({
    visitDecisions: {
      diagnoses: [],
      treatments: [
        {
          treatmentCourseId: "DEMO-002-MINOXIDIL",
          action: "CONTINUE_EXISTING",
          noteText: "Continue nightly application.",
        },
        {
          treatmentCourseId: "DEMO-002-IRON",
          action: "CONTINUE_EXISTING",
          noteText: "Continue until planned reassessment.",
        },
      ],
      procedures: [{
        procedurePlanId: "DEMO-002-PRP",
        action: "CANCEL_OR_DEFER",
        noteText: "Deferred while correcting iron deficiency.",
      }],
    },
    effectivePhysicianState: {
      diagnoses: [],
      treatmentCourses: [
        {
          treatmentCourseId: "DEMO-002-MINOXIDIL",
          name: "Topical minoxidil 5%",
          regimenText: "Continue once nightly; use measured application",
          status: "ACTIVE",
        },
        {
          treatmentCourseId: "DEMO-002-IRON",
          name: "Oral iron replacement",
          regimenText: "Continue per documented deficiency plan",
          status: "ACTIVE",
        },
      ],
      procedurePlans: [{
        procedurePlanId: "DEMO-002-PRP",
        procedureCode: "PRP",
        plannedDate: "2026-06-23",
        status: "CANCELLED_OR_DEFERRED",
      }],
      performedProcedures: [],
    },
  }), {
    treatmentCourses: [
      { treatmentCourseId: "DEMO-002-MINOXIDIL", name: "Topical minoxidil 5%" },
      { treatmentCourseId: "DEMO-002-IRON", name: "Oral iron replacement" },
    ],
    procedurePlans: [{
      procedurePlanId: "DEMO-002-PRP",
      procedureCode: "PRP",
    }],
  });

  assert.deepEqual(content.treatments, [
    {
      status: "Continued",
      title: "Topical minoxidil 5%",
      details: [{ label: "Physician note", value: "Continue nightly application." }],
    },
    {
      status: "Continued",
      title: "Oral iron replacement",
      details: [{ label: "Physician note", value: "Continue until planned reassessment." }],
    },
  ]);
  assert.deepEqual(content.procedures, [{
    status: "Cancelled or deferred",
    title: "PRP / Platelet-Rich Plasma",
    details: [{
      label: "Physician note",
      value: "Deferred while correcting iron deficiency.",
    }],
  }]);
  const rendered = JSON.stringify(content);
  assert.equal(rendered.includes("Continue once nightly; use measured application"), false);
  assert.equal(rendered.includes("Continue per documented deficiency plan"), false);
  assert.equal(rendered.includes("2026-06-23"), false);
});

test("DEMO-002 Visit 3 keeps current regimen and omits previous treatment details", () => {
  const content = buildHospitalSummaryClinicalContent(canonical({
    visitDecisions: {
      diagnoses: [],
      treatments: [
        {
          treatmentCourseId: "DEMO-002-MINOXIDIL",
          action: "MODIFY",
          regimenText: "Continue once nightly; use measured application",
          noteText: "Simplified regimen to support adherence.",
        },
        { treatmentCourseId: "DEMO-002-IRON", action: "STOP" },
      ],
      procedures: [],
    },
    effectivePhysicianState: {
      diagnoses: [],
      treatmentCourses: [{
        treatmentCourseId: "DEMO-002-IRON",
        name: "Oral iron replacement",
        regimenText: "Continue per documented deficiency plan",
        status: "STOPPED",
      }],
      procedurePlans: [],
      performedProcedures: [],
    },
  }), {
    treatmentCourses: [
      { treatmentCourseId: "DEMO-002-MINOXIDIL", name: "Topical minoxidil 5%" },
      { treatmentCourseId: "DEMO-002-IRON", name: "Oral iron replacement" },
    ],
    procedurePlans: [],
  });

  assert.deepEqual(content.treatments, [
    {
      status: "Modified",
      title: "Topical minoxidil 5%",
      details: [
        { label: "Regimen", value: "Continue once nightly; use measured application" },
        { label: "Physician note", value: "Simplified regimen to support adherence." },
      ],
    },
    { status: "Stopped", title: "Oral iron replacement", details: [] },
  ]);
  assert.equal(
    JSON.stringify(content).includes("Continue per documented deficiency plan"),
    false,
  );
});

test("Hospital Summary includes governed findings only when canonical finalized data exists", () => {
  const content = buildHospitalSummaryClinicalContent(canonical({
    canonicalClinicalData: {
      clinicalExamination: { hairPull: "POSITIVE", hairParting: ["FRONTAL_THINNER"] },
      physicianMeasurements: { SHEDDING: 4, ITCH: 2 },
      patternMeasurements: {
        sinclair: 3,
        mcuFv: { displayCode: "M2F1V2" },
        hairLineDistance: { midline: "6.5" },
      },
      trichoscopy: {
        selectedFindings: [{ code: "YELLOW_DOTS", label: "Yellow dots" }],
        otherFindingText: "  Exact free-text finding  ",
      },
      anatomicalMap: {
        regions: [{
          view: "TOP",
          anatomicalRegionCode: "VERTEX_CROWN",
          geometry: { version: 1, strokes: [] },
          noteText: "Focal density loss",
        }],
      },
    },
  }));

  assert.deepEqual(content.clinicalFindings, [
    { label: "Hair Pull", value: "Positive" },
    { label: "Hair Parting", value: "Frontal thinner" },
    { label: "Vertex / crown", value: "Focal density loss" },
  ]);
  assert.deepEqual(content.trichoscopyFindings, [
    "Yellow dots",
    "  Exact free-text finding  ",
  ]);
  assert.deepEqual(content.measurements, [
    { label: "Shedding", value: "4/5" },
    { label: "Itch", value: "2/5" },
    { label: "Sinclair grade", value: "3" },
    { label: "MCU/FV", value: "M2F1V2" },
    { label: "Hair-line distance — Midline", value: "6.5 cm" },
  ]);
  assert.deepEqual(buildHospitalSummaryClinicalContent(canonical()), {
    diagnoses: [],
    treatments: [],
    procedures: [],
    clinicalFindings: [],
    trichoscopyFindings: [],
    measurements: [],
  });
});

test("Hospital Summary loader refuses Drafts before identity metadata is read", async () => {
  let metadataReads = 0;
  const prisma = {
    visit: {
      findFirst: async () => {
        metadataReads += 1;
        return null;
      },
    },
  } as unknown as PrismaClient;

  const result = await loadHospitalVisitSummary(prisma, actor, "visit-id", {
    readCanonical: async () => canonical({
      status: "DRAFT",
      finalizedAt: null,
      canonicalClinicalData: null,
    }),
  });
  assert.equal(result, null);
  assert.equal(metadataReads, 0);
});

test("Hospital Summary loader preserves the existing physician-only authorization boundary", async () => {
  const staff = { ...actor, role: "STAFF" as const };
  await assert.rejects(
    loadHospitalVisitSummary({} as PrismaClient, staff, "visit-id", {
      readCanonical: async () => canonical(),
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "The authenticated actor is not allowed to perform this action.",
  );
});

test("Hospital Summary loader uses a clinic-scoped finalized metadata read", async () => {
  let query: unknown;
  const prisma = {
    visit: {
      findFirst: async (candidate: unknown) => {
        query = candidate;
        return {
          id: "40000000-0000-4000-8000-000000000001",
          patient: {
            id: "50000000-0000-4000-8000-000000000001",
            profile: {
              fullName: "Patient Example",
              dateOfBirth: new Date("1990-09-08T00:00:00.000Z"),
              gender: "FEMALE",
            },
            externalIdentifiers: [{ displayValue: "MRN-001" }],
          },
          reasons: [{ reasonDefinition: { clinicalService: { nameEn: "Dermatology" } } }],
          physicianVisitRecord: {
            finalizedBy: { name: "Dr Example" },
            treatmentDecisions: [],
            procedureDecisions: [],
          },
        };
      },
    },
  } as unknown as PrismaClient;

  const result = await loadHospitalVisitSummary(
    prisma,
    actor,
    "40000000-0000-4000-8000-000000000001",
    { readCanonical: async () => canonical() },
  );
  assert.equal(result?.patient.name, "Patient Example");
  assert.equal(result?.patient.mrn, "MRN-001");
  assert.equal(result?.patient.age, 35);
  assert.equal(result?.patient.sex, "Female");
  assert.equal(result?.visit.physician, "Dr Example");
  assert.equal(result?.visit.service, "Dermatology");
  assert.deepEqual((query as { where: unknown }).where, {
    id: "40000000-0000-4000-8000-000000000001",
    clinicScopeId: actor.clinicScopeId,
    physicianVisitRecord: { is: { status: "FINALIZED" } },
  });
});

test("Hospital Summary loader resolves only stable identities for referenced decisions", async () => {
  let query: unknown;
  const prisma = {
    visit: {
      findFirst: async (candidate: unknown) => {
        query = candidate;
        return {
          id: "visit-2",
          patient: {
            id: "patient-2",
            profile: {
              fullName: "Demo Patient",
              dateOfBirth: new Date("1990-09-08T00:00:00.000Z"),
              gender: "FEMALE",
            },
            externalIdentifiers: [{ displayValue: "DEMO-002" }],
          },
          reasons: [],
          physicianVisitRecord: {
            finalizedBy: { name: "Dr Example" },
            treatmentDecisions: [{
              treatmentCourseId: "course-1",
              treatmentCourse: {
                decisions: [{ name: "Topical minoxidil 5%" }],
              },
            }],
            procedureDecisions: [{
              procedurePlanId: "plan-1",
              procedurePlan: {
                decisions: [{
                  procedureCode: "PRP",
                  otherProcedureText: null,
                }],
              },
            }],
          },
        };
      },
    },
  } as unknown as PrismaClient;

  const result = await loadHospitalVisitSummary(prisma, actor, "visit-2", {
    readCanonical: async () => canonical({
      visitDecisions: {
        diagnoses: [],
        treatments: [{
          treatmentCourseId: "course-1",
          action: "CONTINUE_EXISTING",
          noteText: "Current visit note",
        }],
        procedures: [{
          procedurePlanId: "plan-1",
          action: "CANCEL_OR_DEFER",
          noteText: "Current visit procedure note",
        }],
      },
      effectivePhysicianState: {
        diagnoses: [],
        treatmentCourses: [{
          treatmentCourseId: "course-1",
          name: "LEAKED NAME",
          regimenText: "LEAKED REGIMEN",
          noteText: "LEAKED NOTE",
          status: "ACTIVE",
        }],
        procedurePlans: [{
          procedurePlanId: "plan-1",
          procedureCode: "MICRONEEDLING",
          plannedDate: "2099-01-01",
          noteText: "LEAKED PROCEDURE NOTE",
          status: "CANCELLED_OR_DEFERRED",
        }],
        performedProcedures: [],
      },
    }),
  });

  assert.deepEqual(result?.treatments, [{
    status: "Continued",
    title: "Topical minoxidil 5%",
    details: [{ label: "Physician note", value: "Current visit note" }],
  }]);
  assert.deepEqual(result?.procedures, [{
    status: "Cancelled or deferred",
    title: "PRP / Platelet-Rich Plasma",
    details: [{ label: "Physician note", value: "Current visit procedure note" }],
  }]);
  assert.equal(JSON.stringify(result).includes("LEAKED"), false);
  assert.equal(JSON.stringify(result).includes("2099-01-01"), false);

  const recordSelect = (
    query as {
      select: { physicianVisitRecord: { select: Record<string, unknown> } };
    }
  ).select.physicianVisitRecord.select;
  assert.deepEqual(recordSelect.treatmentDecisions, {
    select: {
      treatmentCourseId: true,
      treatmentCourse: {
        select: {
          decisions: {
            where: { action: "START" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 1,
            select: { name: true },
          },
        },
      },
    },
  });
  assert.deepEqual(recordSelect.procedureDecisions, {
    select: {
      procedurePlanId: true,
      procedurePlan: {
        select: {
          decisions: {
            where: { action: "PLAN" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 1,
            select: { procedureCode: true, otherProcedureText: true },
          },
        },
      },
    },
  });
});

test("Hospital Summary route is physician-only, print-only, English-only, and action is finalized-only", () => {
  const page = readFileSync(new URL("../app/physician/visits/[visitId]/hospital-summary/page.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/physician/visits/[visitId]/hospital-summary/hospital-summary.module.css", import.meta.url), "utf8");
  const printButton = readFileSync(new URL("../app/physician/visits/[visitId]/hospital-summary/print-button.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  const finalizedBranch = workspace.slice(
    workspace.indexOf("if (finalized) return"),
    workspace.indexOf("function CorrectionForm"),
  );

  assert.ok(page.includes('requirePageActor("PHYSICIAN")'));
  assert.ok(page.includes('lang="en" dir="ltr"'));
  assert.ok(page.includes("Hospital Visit Summary"));
  assert.equal(page.includes("PlatformShell"), false);
  assert.ok(printButton.includes("window.print()"));
  assert.ok(styles.includes("@media print"));
  assert.ok(styles.includes("@page"));
  assert.ok(styles.includes("size: A4"));
  assert.ok(styles.includes("display: none !important"));
  assert.ok(finalizedBranch.includes("Hospital Summary PDF"));
  assert.equal(workspace.slice(0, workspace.indexOf("if (finalized) return")).includes("Hospital Summary PDF"), false);
});

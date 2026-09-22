import { createHash } from "node:crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";
import type { QuestionContract } from "@/lib/content-registry/contracts";

export interface RegistryFingerprintContract extends QuestionContract {
  sectionCode: string;
  repeatable?: {
    itemLabelAr: string;
    itemLabelEn: string;
    fields: Array<{
      code: string;
      labelAr: string;
      labelEn: string;
      type: string;
      required: boolean;
      options?: Array<{ code: string; labelAr: string; labelEn: string; exclusiveWith?: string[] }>;
    }>;
  };
}

interface CanonicalRegistryOption {
  code: string;
  labelAr: string;
  labelEn: string;
  sortOrder: number;
  exclusiveWith: string[];
}

interface CanonicalRegistryQuestion {
  code: string;
  version: string;
  libraryCode: string;
  sectionCode: string;
  responseType: string;
  textAr: string;
  textEn: string;
  helpAr: string | null;
  helpEn: string | null;
  visibility: unknown;
  requiredness: unknown;
  validation: unknown;
  scope: string;
  order: number;
  output: unknown;
  status: string;
  isActive: boolean;
  options: CanonicalRegistryOption[];
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalizeJson(nested)]),
    );
  }

  return value;
}


export function publishedValidationRule(question: RegistryFingerprintContract): unknown[] {
  const base = Array.isArray(question.validation) ? [...question.validation] : [];
  if (!question.repeatable) return base;
  return [
    ...base,
    {
      kind: "REPEATABLE_SCHEMA",
      itemLabelAr: question.repeatable.itemLabelAr,
      itemLabelEn: question.repeatable.itemLabelEn,
      fields: question.repeatable.fields.map((field) => ({
        code: field.code,
        labelAr: field.labelAr,
        labelEn: field.labelEn,
        type: field.type,
        required: field.required,
        options: (field.options ?? []).map((option) => ({
          code: option.code,
          labelAr: option.labelAr,
          labelEn: option.labelEn,
          exclusiveWith: [...(option.exclusiveWith ?? [])].sort(),
        })),
      })),
    },
  ];
}

export function stableRegistryStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function registryFingerprint(value: unknown): string {
  return createHash("sha256").update(stableRegistryStringify(value)).digest("hex");
}

export function canonicalRegistryFromContracts(
  contracts: readonly RegistryFingerprintContract[],
): CanonicalRegistryQuestion[] {
  return contracts
    .map((question): CanonicalRegistryQuestion => ({
      code: question.code,
      version: question.version,
      libraryCode: question.libraryCode,
      sectionCode: question.sectionCode,
      responseType: question.responseType,
      textAr: question.localized.ar.label,
      textEn: question.localized.en.label,
      helpAr: question.localized.ar.help ?? null,
      helpEn: question.localized.en.help ?? null,
      visibility: question.visibility,
      requiredness: question.requiredness,
      validation: publishedValidationRule(question),
      scope: question.scope,
      order: question.order,
      output: question.output,
      status: question.status,
      isActive: question.status === "APPROVED",
      options: (question.options ?? []).map((option, sortOrder) => ({
        code: option.code,
        labelAr: option.labelAr,
        labelEn: option.labelEn,
        sortOrder,
        exclusiveWith: [...(option.exclusiveWith ?? [])].sort(),
      })),
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

export async function canonicalRegistryFromDatabase(
  prisma: PrismaClient,
  contentVersionId: string,
): Promise<CanonicalRegistryQuestion[]> {
  const questions = await prisma.questionDefinition.findMany({
    where: { clinicalLibrary: { contentVersionId } },
    include: {
      clinicalLibrary: { select: { code: true } },
      questionGroup: { select: { code: true } },
      options: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] },
    },
  });

  return questions
    .map((question): CanonicalRegistryQuestion => ({
      code: question.code,
      version: question.version,
      libraryCode: question.clinicalLibrary.code,
      sectionCode: question.questionGroup.code,
      responseType: question.responseType,
      textAr: question.textAr,
      textEn: question.textEn,
      helpAr: question.helpAr,
      helpEn: question.helpEn,
      visibility: question.visibilityRule,
      requiredness: question.requirednessRule,
      validation: question.validationRule,
      scope: question.responseScopePolicy,
      order: question.sortOrder,
      output: question.outputEligibility,
      status: question.status,
      isActive: question.isActive,
      options: question.options.map((option) => ({
        code: option.code,
        labelAr: option.labelAr,
        labelEn: option.labelEn,
        sortOrder: option.sortOrder,
        exclusiveWith: Array.isArray(option.exclusiveWithCodes)
          ? [...option.exclusiveWithCodes]
              .filter((item): item is string => typeof item === "string")
              .sort()
          : [],
      })),
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

export async function assertPublishedRegistryMatchesContracts(
  prisma: PrismaClient,
  contentVersionId: string,
  contracts: readonly RegistryFingerprintContract[],
): Promise<{ fingerprint: string; questionCount: number }> {
  const contractCanonical = canonicalRegistryFromContracts(contracts);
  const databaseCanonical = await canonicalRegistryFromDatabase(prisma, contentVersionId);
  const contractFingerprint = registryFingerprint(contractCanonical);
  const databaseFingerprint = registryFingerprint(databaseCanonical);

  if (contractFingerprint !== databaseFingerprint) {
    throw new Error(
      [
        "Published Question Registry drift detected.",
        `Contracts fingerprint: ${contractFingerprint}`,
        `Database fingerprint: ${databaseFingerprint}`,
        `Contracts questions: ${contractCanonical.length}`,
        `Database questions: ${databaseCanonical.length}`,
      ].join(" "),
    );
  }

  return { fingerprint: contractFingerprint, questionCount: contractCanonical.length };
}

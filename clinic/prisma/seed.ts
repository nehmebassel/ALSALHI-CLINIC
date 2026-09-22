import "dotenv/config";

import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../app/generated/prisma/client";
import { validateQuestionRegistryPublication } from "../lib/content-registry/contracts";
import { assertPublishedRegistryMatchesContracts, publishedValidationRule } from "../lib/content-registry/fingerprint";
import { hashPassword, normalizeUsername, usernameLoginEmail } from "../lib/auth/password";
import {
  BOOTSTRAP_LOGIN_DOMAIN,
  developmentBootstrapAccounts,
  isDevelopmentAuthEnabled,
} from "../lib/auth/development-auth";
import {
  P01_CONTENT_VERSION,
  P01_PATHWAY_CODES,
  P01_QUESTION_CONTRACTS,
} from "../lib/p01/contracts";
import {
  RULE_HAIR_TO_SCALP,
  RULE_SCALP_TO_HAIR,
} from "../lib/p01/engine-service";

const FOUNDATION_CONTENT_VERSION = "PILOT0_FOUNDATION_v1.7.2";

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  // Validate the complete auth configuration before performing any database
  // mutation. Production and reusable defaults fail closed.
  const bootstrapUsers = developmentBootstrapAccounts();
  const clinicScope = await prisma.clinicScope.upsert({
    where: { code: "PILOT0" },
    update: {
      nameAr: "نطاق العيادة التجريبي",
      nameEn: "Pilot 0 Clinic Scope",
    },
    create: {
      code: "PILOT0",
      nameAr: "نطاق العيادة التجريبي",
      nameEn: "Pilot 0 Clinic Scope",
    },
  });

  for (const role of [
    { code: "PHYSICIAN", nameAr: "طبيب", nameEn: "Physician" },
    { code: "STAFF", nameAr: "موظف", nameEn: "Staff" },
  ]) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: role,
      create: role,
    });
  }

  // Local synthetic bootstrap accounts. Never seed these when dev auth is disabled.
  if (!isDevelopmentAuthEnabled() || process.env.P01_ENABLE_LEGACY_DEV_AUTH !== "true") {
    const legacyUsers = await prisma.user.findMany({
      where: {
        email: { in: ["synthetic-staff@p01.invalid", "synthetic-physician@p01.invalid"] },
      },
      select: { id: true },
    });
    if (legacyUsers.length > 0) {
      const legacyUserIds = legacyUsers.map((user) => user.id);
      await prisma.authenticatedUserSession.updateMany({
        where: { userId: { in: legacyUserIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.user.updateMany({
        where: { id: { in: legacyUserIds } },
        data: { isActive: false },
      });
    }
  }

  const configuredBootstrapEmails = new Set(
    bootstrapUsers.map((bootstrap) => usernameLoginEmail(normalizeUsername(bootstrap.username))),
  );
  const obsoleteBootstrapUsers = await prisma.user.findMany({
    where: { email: { endsWith: BOOTSTRAP_LOGIN_DOMAIN } },
    select: { id: true, email: true },
  });
  const obsoleteBootstrapIds = obsoleteBootstrapUsers
    .filter((user) => !configuredBootstrapEmails.has(user.email))
    .map((user) => user.id);
  if (obsoleteBootstrapIds.length > 0) {
    await prisma.authenticatedUserSession.updateMany({
      where: { userId: { in: obsoleteBootstrapIds }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.user.updateMany({
      where: { id: { in: obsoleteBootstrapIds } },
      data: { isActive: false },
    });
  }

  if (bootstrapUsers.length > 0) {

    for (const bootstrap of bootstrapUsers) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: bootstrap.roleCode } });
      const username = normalizeUsername(bootstrap.username);
      await prisma.user.upsert({
        where: { email: usernameLoginEmail(username) },
        update: {
          name: bootstrap.name,
          passwordHash: hashPassword(bootstrap.password),
          roleId: role.id,
          isActive: true,
        },
        create: {
          name: bootstrap.name,
          email: usernameLoginEmail(username),
          passwordHash: hashPassword(bootstrap.password),
          roleId: role.id,
          isActive: true,
        },
      });
    }
  }

  let contentVersion = await prisma.contentVersion.findUnique({
    where: { versionCode: FOUNDATION_CONTENT_VERSION },
  });

  if (!contentVersion) {
    contentVersion = await prisma.contentVersion.create({
      data: {
        versionCode: FOUNDATION_CONTENT_VERSION,
        isActive: true,
        publishedAt: new Date(),
      },
    });
  }

  const services = [
    {
      code: "HAIR",
      nameAr: "الشعر وفروة الرأس",
      nameEn: "Hair and Scalp",
    },
    {
      code: "DERMATOLOGY",
      nameAr: "الأمراض الجلدية",
      nameEn: "Dermatology",
    },
    { code: "LASER", nameAr: "الليزر", nameEn: "Laser" },
    {
      code: "AESTHETIC_PROCEDURES",
      nameAr: "الإجراءات التجميلية",
      nameEn: "Aesthetic Procedures",
    },
  ];
  const serviceIds = new Map<string, string>();

  for (const service of services) {
    const saved = await prisma.clinicalService.upsert({
      where: { code: service.code },
      update: { ...service, isActive: true },
      create: { ...service, isActive: true },
    });
    serviceIds.set(saved.code, saved.id);
  }

  const reasons = [
    {
      code: "RV_HAIR_LOSS",
      service: "HAIR",
      labelAr: "تساقط الشعر أو ترققه / نقص كثافته",
      labelEn: "Hair Loss, Thinning, or Reduced Density",
    },
    {
      code: "RV_SCALP_SYMPTOMS",
      service: "HAIR",
      labelAr: "أعراض فروة الرأس",
      labelEn: "Scalp Symptoms",
    },
    {
      code: "RV_HAIR_QUALITY",
      service: "HAIR",
      labelAr: "جودة الشعر",
      labelEn: "Hair Quality",
    },
    {
      code: "RV_DERMATOLOGY",
      service: "DERMATOLOGY",
      labelAr: "الأمراض الجلدية",
      labelEn: "Dermatology",
    },
    {
      code: "RV_LASER",
      service: "LASER",
      labelAr: "الليزر",
      labelEn: "Laser",
    },
    {
      code: "RV_AESTHETIC_PROCEDURES",
      service: "AESTHETIC_PROCEDURES",
      labelAr: "الإجراءات التجميلية",
      labelEn: "Aesthetic Procedures",
    },
  ];

  for (const reason of reasons) {
    await prisma.reasonForVisitDefinition.upsert({
      where: {
        contentVersionId_code: {
          contentVersionId: contentVersion.id,
          code: reason.code,
        },
      },
      update: {
        clinicalServiceId: serviceIds.get(reason.service)!,
        labelAr: reason.labelAr,
        labelEn: reason.labelEn,
        isActive: true,
      },
      create: {
        contentVersionId: contentVersion.id,
        clinicalServiceId: serviceIds.get(reason.service)!,
        code: reason.code,
        labelAr: reason.labelAr,
        labelEn: reason.labelEn,
        isActive: true,
      },
    });
  }

  validateQuestionRegistryPublication(P01_QUESTION_CONTRACTS);

  const p01ContentVersion = await prisma.contentVersion.upsert({
    where: { versionCode: P01_CONTENT_VERSION },
    update: {
      isActive: true,
      publishedAt: contentVersion.publishedAt ?? new Date(),
    },
    create: {
      versionCode: P01_CONTENT_VERSION,
      isActive: true,
      publishedAt: new Date(),
    },
  });

  await prisma.contentVersion.updateMany({
    where: {
      id: { not: p01ContentVersion.id },
      isActive: true,
    },
    data: { isActive: false },
  });

  for (const reason of reasons) {
    await prisma.reasonForVisitDefinition.upsert({
      where: {
        contentVersionId_code: {
          contentVersionId: p01ContentVersion.id,
          code: reason.code,
        },
      },
      update: {
        clinicalServiceId: serviceIds.get(reason.service)!,
        labelAr: reason.labelAr,
        labelEn: reason.labelEn,
        isActive: true,
      },
      create: {
        contentVersionId: p01ContentVersion.id,
        clinicalServiceId: serviceIds.get(reason.service)!,
        code: reason.code,
        labelAr: reason.labelAr,
        labelEn: reason.labelEn,
        isActive: true,
      },
    });
  }

  const pathwayDefinitions = [
    { code: P01_PATHWAY_CODES.hairScalp, service: "HAIR", ar: "مسار الشعر وفروة الرأس", en: "Hair and Scalp Pathway" },
    { code: P01_PATHWAY_CODES.hairQuality, service: "HAIR", ar: "مسار جودة الشعر", en: "Hair Quality Pathway" },
    { code: P01_PATHWAY_CODES.dermatology, service: "DERMATOLOGY", ar: "مسار الجلدية", en: "Dermatology Pathway" },
    { code: P01_PATHWAY_CODES.laser, service: "LASER", ar: "مسار الليزر", en: "Laser Pathway" },
    { code: P01_PATHWAY_CODES.aesthetic, service: "AESTHETIC_PROCEDURES", ar: "مسار الإجراءات التجميلية", en: "Aesthetic Procedures Pathway" },
  ];
  for (const pathway of pathwayDefinitions) {
    await prisma.clinicalPathwayDefinition.upsert({
      where: { code_contentVersionId: { code: pathway.code, contentVersionId: p01ContentVersion.id } },
      update: { clinicalServiceId: serviceIds.get(pathway.service)!, nameAr: pathway.ar, nameEn: pathway.en, isActive: true },
      create: { code: pathway.code, contentVersionId: p01ContentVersion.id, clinicalServiceId: serviceIds.get(pathway.service)!, nameAr: pathway.ar, nameEn: pathway.en, isActive: true },
    });
  }

  const aestheticDefinitions = [
    ["AP_BOTOX", "بوتوكس", "Botox"],
    ["AP_FILLER", "فيلر", "Filler"],
    ["AP_SKIN_BOOSTER", "سكين بوستر", "Skin booster"],
    ["AP_COLLAGEN_STIMULATORS", "محفزات الكولاجين", "Collagen stimulators"],
    ["AP_FAT_DISSOLVING", "حقن إذابة الدهون", "Fat-dissolving injections"],
    ["AP_SWEATING_INJECTION", "علاج التعرق بالحقن", "Injected treatment for sweating"],
    ["AP_BODY_CONTOURING", "إجراءات نحت أو تحسين القوام", "Body contouring or body-improvement procedures"],
    ["AP_OTHER", "إجراء تجميلي آخر", "Other aesthetic procedure"],
  ] as const;
  for (const [code, labelAr, labelEn] of aestheticDefinitions) {
    await prisma.aestheticProcedureDefinition.upsert({
      where: { contentVersionId_code: { contentVersionId: p01ContentVersion.id, code } },
      update: { labelAr, labelEn, isActive: true },
      create: { contentVersionId: p01ContentVersion.id, code, labelAr, labelEn, isActive: true },
    });
  }

  const laserDefinitions = [
    ["LASER_UNWANTED_HAIR", "إزالة الشعر غير المرغوب فيه", "Unwanted hair removal"],
    ["LASER_PIGMENTATION", "التصبغات والبقع الداكنة، بما فيها النمش", "Pigmentation and dark spots, including freckles"],
    ["LASER_MELASMA", "الكلف", "Melasma"],
    ["LASER_REDNESS_VESSELS", "الاحمرار والوردية والأوعية الدموية السطحية", "Redness, rosacea, and superficial blood vessels"],
    ["LASER_ACNE_SCARS", "ندبات حب الشباب", "Acne scars"],
    ["LASER_OTHER_SCARS", "الندبات الأخرى", "Other scars"],
    ["LASER_RESURFACING", "إعادة تسطيح الجلد لتحسين الملمس أو الخطوط الدقيقة", "Skin resurfacing for texture or fine lines"],
    ["LASER_TATTOO_PMU", "إزالة الوشم أو المكياج الدائم", "Tattoo or permanent-makeup removal"],
    ["LASER_OTHER", "مشكلة أخرى قد تحتاج علاجًا بالليزر", "Another concern that may need laser treatment"],
    ["LASER_UNSURE", "غير متأكد وأرغب بمناقشة الخيارات مع الطبيب", "Not sure; discuss options with the doctor"],
  ] as const;
  for (const [code, labelAr, labelEn] of laserDefinitions) {
    await prisma.laserServiceDefinition.upsert({
      where: { contentVersionId_code: { contentVersionId: p01ContentVersion.id, code } },
      update: { labelAr, labelEn, isActive: true },
      create: { contentVersionId: p01ContentVersion.id, code, labelAr, labelEn, isActive: true },
    });
  }

  for (const rule of [
    {
      code: RULE_HAIR_TO_SCALP,
      definitionJson: {
        primary: "RV_HAIR_LOSS",
        gateQuestionCode: "Q_SECONDARY_SCALP_GATE",
        activateModule: "SCALP",
        doesNotCreateVisitReason: true,
      },
    },
    {
      code: RULE_SCALP_TO_HAIR,
      definitionJson: {
        primary: "RV_SCALP_SYMPTOMS",
        gateQuestionCode: "Q_SECONDARY_HAIR_GATE",
        activateModule: "HAIR_LOSS",
        doesNotCreateVisitReason: true,
      },
    },
  ]) {
    const savedRule = await prisma.ruleVersion.upsert({
      where: { code_version: { code: rule.code, version: "1.0.0" } },
      update: {
        ruleType: "ACTIVATION",
        definitionJson: rule.definitionJson,
      },
      create: {
        code: rule.code,
        version: "1.0.0",
        ruleType: "ACTIVATION",
        definitionJson: rule.definitionJson,
      },
    });

    await prisma.contentVersionRuleVersion.upsert({
      where: {
        contentVersionId_ruleVersionId: {
          contentVersionId: p01ContentVersion.id,
          ruleVersionId: savedRule.id,
        },
      },
      update: {},
      create: {
        contentVersionId: p01ContentVersion.id,
        ruleVersionId: savedRule.id,
      },
    });
  }

  const libraryLabels: Record<string, { ar: string; en: string }> = {
    PATIENT_PROFILE: { ar: "بيانات المراجع", en: "Patient Profile" },
    VISIT_CONTEXT: { ar: "سياق الزيارة", en: "Visit Context" },
    MEDICAL_HISTORY: { ar: "الصحة العامة", en: "Medical History" },
    HAIR_LOSS: { ar: "تساقط الشعر", en: "Hair Loss" },
    SCALP: { ar: "فروة الرأس", en: "Scalp" },
    HAIR_SCALP_SHARED: {
      ar: "التاريخ المشترك للشعر والفروة",
      en: "Shared Hair and Scalp History",
    },
    LIFESTYLE_NUTRITION: { ar: "نمط الحياة والتغذية", en: "Lifestyle and Nutrition" },
    WOMENS_HEALTH: { ar: "صحة المرأة", en: "Women's Health" },
    MENS_HEALTH: { ar: "صحة الرجل", en: "Men's Health" },
    PREGNANCY_CONTEXT: { ar: "سياق الحمل", en: "Pregnancy Context" },
    HAIR_QUALITY: { ar: "جودة الشعر وروتين العناية", en: "Hair Quality and Care Routine" },
    DERMATOLOGY: { ar: "الجلدية", en: "Dermatology" },
    LASER: { ar: "الليزر", en: "Laser" },
    AESTHETIC_PROCEDURES: { ar: "الإجراءات التجميلية", en: "Aesthetic Procedures" },
  };
  const libraryIds = new Map<string, string>();

  for (const [code, labels] of Object.entries(libraryLabels)) {
    const library = await prisma.clinicalLibrary.upsert({
      where: {
        code_contentVersionId: {
          code,
          contentVersionId: p01ContentVersion.id,
        },
      },
      update: { nameAr: labels.ar, nameEn: labels.en, isActive: true },
      create: {
        code,
        contentVersionId: p01ContentVersion.id,
        nameAr: labels.ar,
        nameEn: labels.en,
        isActive: true,
      },
    });
    libraryIds.set(code, library.id);
  }

  const groupIds = new Map<string, string>();
  const groups = [
    ["PRIVACY", "PATIENT_PROFILE", "الخصوصية", "Privacy"],
    ["PROFILE", "PATIENT_PROFILE", "البيانات الأساسية", "Profile"],
    ["VISIT_REASON", "VISIT_CONTEXT", "سبب الزيارة", "Visit Reason"],
    ["HEALTH_SNAPSHOT", "MEDICAL_HISTORY", "الصحة العامة", "Health Snapshot"],
    ["HAIR_LOSS", "HAIR_LOSS", "مشكلة الشعر", "Hair Loss"],
    ["SCALP", "SCALP", "فروة الرأس", "Scalp"],
    ["SHARED_HISTORY", "HAIR_SCALP_SHARED", "تاريخ الشعر والفروة", "Shared History"],
    ["COURSE_IMPACT", "HAIR_LOSS", "المسار والأثر", "Course and Impact"],
    ["LIFESTYLE_NUTRITION", "LIFESTYLE_NUTRITION", "نمط الحياة والتغذية", "Lifestyle and Nutrition"],
    ["WOMENS_HEALTH", "WOMENS_HEALTH", "صحة المرأة", "Women's Health"],
    ["MENS_HEALTH", "MENS_HEALTH", "صحة الرجل", "Men's Health"],
    ["PREGNANCY_CONTEXT", "PREGNANCY_CONTEXT", "سياق الحمل", "Pregnancy Context"],
    ["HAIR_QUALITY", "HAIR_QUALITY", "جودة الشعر وروتين العناية", "Hair Quality and Care Routine"],
    ["DERMATOLOGY", "DERMATOLOGY", "المشكلة الجلدية", "Dermatology Concern"],
    ["LASER", "LASER", "الليزر", "Laser"],
    ["AESTHETIC_PROCEDURES", "AESTHETIC_PROCEDURES", "الإجراءات التجميلية", "Aesthetic Procedures"],
  ] as const;

  for (const [code, libraryCode, titleAr, titleEn] of groups) {
    const group = await prisma.questionGroup.upsert({
      where: {
        clinicalLibraryId_code: {
          clinicalLibraryId: libraryIds.get(libraryCode)!,
          code,
        },
      },
      update: { titleAr, titleEn, sortOrder: groups.findIndex(([item]) => item === code) },
      create: {
        clinicalLibraryId: libraryIds.get(libraryCode)!,
        code,
        titleAr,
        titleEn,
        sortOrder: groups.findIndex(([item]) => item === code),
      },
    });
    groupIds.set(code, group.id);
  }

  for (const question of P01_QUESTION_CONTRACTS) {
    const savedQuestion = await prisma.questionDefinition.upsert({
      where: {
        clinicalLibraryId_code: {
          clinicalLibraryId: libraryIds.get(question.libraryCode)!,
          code: question.code,
        },
      },
      update: {
        questionGroupId: groupIds.get(question.sectionCode)!,
        version: question.version,
        textAr: question.localized.ar.label,
        textEn: question.localized.en.label,
        helpAr: question.localized.ar.help,
        helpEn: question.localized.en.help,
        responseType: question.responseType,
        visibilityRule: question.visibility as Prisma.InputJsonValue,
        requirednessRule: question.requiredness as Prisma.InputJsonValue,
        validationRule: publishedValidationRule(question) as Prisma.InputJsonValue,
        responseScopePolicy: question.scope,
        dependencies: [] as Prisma.InputJsonValue,
        orderingKey: `${String(question.order).padStart(4, "0")}:${question.code}`,
        outputEligibility: question.output as Prisma.InputJsonValue,
        provenanceBaseline: question.provenance.baseline,
        provenanceSourceFile: question.provenance.sourceFile,
        provenanceSourceSection: question.provenance.sourceSection,
        status: "APPROVED",
        sortOrder: question.order,
        isActive: true,
      },
      create: {
        clinicalLibraryId: libraryIds.get(question.libraryCode)!,
        questionGroupId: groupIds.get(question.sectionCode)!,
        code: question.code,
        version: question.version,
        textAr: question.localized.ar.label,
        textEn: question.localized.en.label,
        helpAr: question.localized.ar.help,
        helpEn: question.localized.en.help,
        responseType: question.responseType,
        visibilityRule: question.visibility as Prisma.InputJsonValue,
        requirednessRule: question.requiredness as Prisma.InputJsonValue,
        validationRule: publishedValidationRule(question) as Prisma.InputJsonValue,
        responseScopePolicy: question.scope,
        dependencies: [] as Prisma.InputJsonValue,
        orderingKey: `${String(question.order).padStart(4, "0")}:${question.code}`,
        outputEligibility: question.output as Prisma.InputJsonValue,
        provenanceBaseline: question.provenance.baseline,
        provenanceSourceFile: question.provenance.sourceFile,
        provenanceSourceSection: question.provenance.sourceSection,
        status: "APPROVED",
        sortOrder: question.order,
        isActive: true,
      },
    });

    const optionCodes = (question.options ?? []).map(({ code }) => code);
    await prisma.questionOptionDefinition.deleteMany({
      where: {
        questionDefinitionId: savedQuestion.id,
        ...(optionCodes.length > 0 ? { code: { notIn: optionCodes } } : {}),
      },
    });

    for (const [sortOrder, option] of (question.options ?? []).entries()) {
      await prisma.questionOptionDefinition.upsert({
        where: {
          questionDefinitionId_code: {
            questionDefinitionId: savedQuestion.id,
            code: option.code,
          },
        },
        update: {
          labelAr: option.labelAr,
          labelEn: option.labelEn,
          sortOrder,
          exclusiveWithCodes: option.exclusiveWith ?? [],
        },
        create: {
          questionDefinitionId: savedQuestion.id,
          code: option.code,
          labelAr: option.labelAr,
          labelEn: option.labelEn,
          sortOrder,
          exclusiveWithCodes: option.exclusiveWith ?? [],
        },
      });
    }
  }

  const registryGuard = await assertPublishedRegistryMatchesContracts(
    prisma,
    p01ContentVersion.id,
    P01_QUESTION_CONTRACTS,
  );

  console.log(
    `Seeded foundation ${FOUNDATION_CONTENT_VERSION} and P01 ${P01_CONTENT_VERSION} for ${clinicScope.code}; P01 registry publication validation passed; fingerprint ${registryGuard.fingerprint.slice(0, 12)} (${registryGuard.questionCount} questions).`,
  );
}

async function runSeedCli(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed PostgreSQL.");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeedCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

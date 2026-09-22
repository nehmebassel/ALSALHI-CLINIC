import "dotenv/config";

import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

function assertSafeLocalDatabase(connectionString: string): void {
  const url = new URL(connectionString);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!localHosts.has(url.hostname)) {
    throw new Error(`Refusing patient-data reset on non-local database host: ${url.hostname}`);
  }
  if (process.env.ALLOW_SYNTHETIC_DATA_RESET !== "true") {
    throw new Error("Set ALLOW_SYNTHETIC_DATA_RESET=true to confirm deletion of local patient/runtime data.");
  }
}

export async function clearPatientRuntimeData(prisma: PrismaClient): Promise<void> {
  // Patient is the root of the clinical runtime graph. InterviewInvitation is also
  // included because invitations for brand-new MRNs may not have a Patient yet.
  // CASCADE follows runtime-only FK dependents while leaving registry/content/users intact.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Patient", "InterviewInvitation" CASCADE');
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  assertSafeLocalDatabase(connectionString);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const before = await prisma.patient.count();
    await clearPatientRuntimeData(prisma);
    const after = await prisma.patient.count();
    console.log(`Cleared local patient/runtime data. Patients: ${before} -> ${after}. Registry, migrations, roles, and users were preserved.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

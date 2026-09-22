import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";
import { clinicianDemoPrismaSchema } from "@/lib/local-clinician-demo";

const globalForPrisma = globalThis as typeof globalThis & {
  patientAccessPrisma?: PrismaClient;
};

let prismaClient: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  const existingClient =
    prismaClient ?? globalForPrisma.patientAccessPrisma;

  if (existingClient) {
    prismaClient = existingClient;
    return existingClient;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the Prisma client.");
  }

  const demoSchema = clinicianDemoPrismaSchema();

  const client = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString },
      demoSchema ? { schema: demoSchema } : undefined,
    ),
  });
  prismaClient = client;

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.patientAccessPrisma = client;
  }

  return client;
}

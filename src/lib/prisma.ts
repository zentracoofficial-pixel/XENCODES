import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * DATABASE_URL is the name this app has always used, but a Postgres
 * provisioned through Vercel's own Marketplace integration (Neon or
 * Vercel Postgres) does not set that name at all — it sets a family of
 * its own (POSTGRES_PRISMA_URL, POSTGRES_URL, ...) and expects the app to
 * know its conventions. Falling back through them here means connecting
 * a project to a database that way keeps working without the app-level
 * env var also having to be added and kept in sync by hand. The same
 * reasoning, for the same reason, already lives in prisma7.config.ts for
 * the migration CLI's direct connection.
 */
function resolveConnectionString(): string {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL;
  if (!value) {
    throw new Error(
      "No database connection string is set. Expected DATABASE_URL, or POSTGRES_PRISMA_URL / POSTGRES_URL from a Vercel Postgres or Neon integration.",
    );
  }
  return value;
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: resolveConnectionString() });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

#!/usr/bin/env node
// Vercel builds every push to every branch, including Preview deployments
// for branches that don't have a database configured in that environment
// scope. `prisma migrate deploy` hard-fails immediately when no datasource
// URL is available at all (see prisma7.config.ts), which would otherwise
// take down Preview builds that were never meant to touch a database.
// Production keeps a real DB URL configured, so this changes nothing there.
import { spawnSync } from "node:child_process";

const migrationDatabaseUrl =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (migrationDatabaseUrl) {
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.warn(
    "[build] No database URL found (DIRECT_DATABASE_URL / DATABASE_URL_UNPOOLED / " +
      "POSTGRES_URL_NON_POOLING / DATABASE_URL are all unset) — skipping " +
      "`prisma migrate deploy`. This is expected for a Preview deployment with " +
      "no database attached; Production must keep one of these set.",
  );
}

run("npx", ["next", "build"]);

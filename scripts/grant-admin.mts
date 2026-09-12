/**
 * Promote or demote a Xencodes account.
 *
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:grant -- someone@example.com --revoke
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const [emailArg, ...flags] = process.argv.slice(2);
const revoke = flags.includes("--revoke");

if (!emailArg) {
  console.error("Usage: npm run admin:grant -- <email> [--revoke]");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const email = emailArg.trim().toLowerCase();

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: revoke ? "USER" : "ADMIN" },
  });

  console.log(`${updated.email} is now ${updated.role}.`);
} finally {
  await prisma.$disconnect();
}

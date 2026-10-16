import test, { after } from "node:test";
import assert from "node:assert/strict";

/** The reset form cannot be used to flood one inbox: a few emails an hour per account. */

const { prisma } = await import("../src/lib/prisma");
const { forgotPasswordAction } = await import("../src/app/(auth)/forgot-password/actions");

const email = `reset-throttle-${Date.now()}@example.com`;

after(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

function form(address: string) {
  const data = new FormData();
  data.set("email", address);
  return data;
}

test("only three reset links are made per hour for one account, and every answer is the same", async () => {
  const user = await prisma.user.create({ data: { email, passwordHash: "x", currency: "NGN" } });
  const answers = [];
  for (let i = 0; i < 6; i += 1) answers.push(await forgotPasswordAction({}, form(email)));
  assert.ok(answers.every((answer) => answer.success === true && !answer.error));
  assert.equal(await prisma.passwordResetToken.count({ where: { userId: user.id } }), 3);

  // An address with no account gets the same answer.
  assert.deepEqual(await forgotPasswordAction({}, form(`nobody-${Date.now()}@example.com`)), { success: true });
});

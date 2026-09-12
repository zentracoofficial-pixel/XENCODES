import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = {
  globalMarkupPercent: "global_markup_percent",
  providerName: "provider_name",
  providerBaseUrl: "provider_base_url",
  providerApiKey: "provider_api_key",
  providerEnabled: "provider_enabled",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export async function readSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function writeSetting(key: SettingKey, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export function readNumber(
  settings: Record<string, string>,
  key: SettingKey,
  fallback = 0,
) {
  const parsed = Number(settings[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Shows enough of a secret to recognise it without exposing it. */
export function maskSecret(value: string | undefined) {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(Math.min(16, value.length - 8))}${value.slice(-4)}`;
}

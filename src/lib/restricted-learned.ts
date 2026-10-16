import { prisma } from "@/lib/prisma";
import { compactName, type RestrictedCategory, type RestrictedMatch } from "@/lib/restricted-services";

/**
 * What each server has blocked, kept so the other server follows it: a
 * service restricted on Server I is restricted on Server II under any
 * spelling of the same name ("Bet 365", "bet-365"), and the other way round.
 * One settings row, a list of blocked names per server.
 */
const KEY = "restricted_names_v1";

type Stored = Record<string, Array<{ name: string; category: RestrictedCategory; term: string }>>;

async function readAll(): Promise<Stored> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    const value = row ? (JSON.parse(row.value) as Stored) : {};
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export interface LearnedRestrictedStore {
  /** Names blocked by every server except this one. */
  readOthers(providerId: string): Promise<Map<string, RestrictedMatch>>;
  /** Records what this server just blocked. */
  write(providerId: string, blocked: Array<{ name: string; category: string; term: string }>): Promise<void>;
}

export const settingsLearnedRestricted: LearnedRestrictedStore = {
  async readOthers(providerId) {
    const all = await readAll();
    const map = new Map<string, RestrictedMatch>();
    for (const [id, list] of Object.entries(all)) {
      if (id === providerId || !Array.isArray(list)) continue;
      for (const item of list) {
        if (item?.name) map.set(compactName(item.name), { category: item.category, term: `also blocked on another server (${item.term})` });
      }
    }
    return map;
  },
  async write(providerId, blocked) {
    const all = await readAll();
    const next = blocked
      .map((item) => ({ name: item.name, category: item.category as RestrictedCategory, term: item.term }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (JSON.stringify(all[providerId] ?? []) === JSON.stringify(next)) return;
    all[providerId] = next;
    const value = JSON.stringify(all);
    await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  },
};

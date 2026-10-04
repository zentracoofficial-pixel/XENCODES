import { readSettings, readBoolean, SETTING_KEYS } from "@/lib/settings";

/**
 * The announcement bar every signed-in customer sees at the top of their
 * dashboard: a place to say, in the admin's own words, what Xencodes is doing
 * and when prices move. Editable at /admin/settings, so a notice about a price
 * change never needs a code change.
 *
 * The text below is what shows until an admin writes their own. It states
 * the price behaviour as it actually works: the price is live, it is shown
 * before every purchase, and when the number a customer was quoted sells out
 * at the very moment they buy, the next one available can cost a little more.
 */
export const DEFAULT_ANNOUNCEMENT_TITLE = "A note from Xencodes";
export const DEFAULT_ANNOUNCEMENT_MESSAGE =
  "We are working hard to give you the best quality and the best services for everything you need. " +
  "Prices follow live availability from our suppliers, so a price can occasionally rise when cheaper numbers sell out. " +
  "We always show you the current price before you buy, and we will keep you informed whenever prices change.";

export interface Announcement {
  enabled: boolean;
  title: string;
  message: string;
  /** Changes whenever the wording does, so a customer who dismissed the old
   *  notice sees a new one. */
  version: string;
}

/** Small, stable, non-cryptographic hash: only used to tell one wording from
 *  another in the browser's own storage. */
function versionOf(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export async function getAnnouncement(): Promise<Announcement> {
  const settings = await readSettings();
  const title = settings[SETTING_KEYS.announcementTitle]?.trim() || DEFAULT_ANNOUNCEMENT_TITLE;
  const message = settings[SETTING_KEYS.announcementMessage]?.trim() || DEFAULT_ANNOUNCEMENT_MESSAGE;
  return {
    enabled: readBoolean(settings, SETTING_KEYS.announcementEnabled, true),
    title,
    message,
    version: versionOf(`${title}\n${message}`),
  };
}

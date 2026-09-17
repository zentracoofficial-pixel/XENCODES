import type { ProviderCountry } from "./types";

/**
 * Display metadata for real countries: a slug, a flag, a dial code, and how
 * many digits a national number runs to. This is not inventory. A supplier
 * in this API family reports a country's name and nothing else about how to
 * display it, so this table exists purely to render a name Xencodes already
 * received from the supplier a little better, exactly the way a phone
 * number is grouped for readability elsewhere in this codebase.
 *
 * Keyed by the English name the supplier is expected to use, lowercased.
 * Nothing here decides whether a country is for sale: that is entirely the
 * supplier's live answer. A country not in this table is still sold, just
 * with a generic flag and a best-effort digit count, in getCountryMeta()'s
 * fallback below.
 */
const COUNTRY_META: Record<
  string,
  { slug: string; flag: string; dialCode: string; nationalDigits: number }
> = {
  nigeria: { slug: "nigeria", flag: "🇳🇬", dialCode: "+234", nationalDigits: 10 },
  ghana: { slug: "ghana", flag: "🇬🇭", dialCode: "+233", nationalDigits: 9 },
  kenya: { slug: "kenya", flag: "🇰🇪", dialCode: "+254", nationalDigits: 9 },
  "south africa": { slug: "south-africa", flag: "🇿🇦", dialCode: "+27", nationalDigits: 9 },
  egypt: { slug: "egypt", flag: "🇪🇬", dialCode: "+20", nationalDigits: 10 },
  tanzania: { slug: "tanzania", flag: "🇹🇿", dialCode: "+255", nationalDigits: 9 },
  uganda: { slug: "uganda", flag: "🇺🇬", dialCode: "+256", nationalDigits: 9 },
  cameroon: { slug: "cameroon", flag: "🇨🇲", dialCode: "+237", nationalDigits: 9 },
  "ivory coast": { slug: "ivory-coast", flag: "🇨🇮", dialCode: "+225", nationalDigits: 10 },
  senegal: { slug: "senegal", flag: "🇸🇳", dialCode: "+221", nationalDigits: 9 },
  usa: { slug: "usa", flag: "🇺🇸", dialCode: "+1", nationalDigits: 10 },
  "united states": { slug: "usa", flag: "🇺🇸", dialCode: "+1", nationalDigits: 10 },
  canada: { slug: "canada", flag: "🇨🇦", dialCode: "+1", nationalDigits: 10 },
  "united kingdom": { slug: "uk", flag: "🇬🇧", dialCode: "+44", nationalDigits: 10 },
  uk: { slug: "uk", flag: "🇬🇧", dialCode: "+44", nationalDigits: 10 },
  germany: { slug: "germany", flag: "🇩🇪", dialCode: "+49", nationalDigits: 11 },
  france: { slug: "france", flag: "🇫🇷", dialCode: "+33", nationalDigits: 9 },
  spain: { slug: "spain", flag: "🇪🇸", dialCode: "+34", nationalDigits: 9 },
  italy: { slug: "italy", flag: "🇮🇹", dialCode: "+39", nationalDigits: 10 },
  netherlands: { slug: "netherlands", flag: "🇳🇱", dialCode: "+31", nationalDigits: 9 },
  poland: { slug: "poland", flag: "🇵🇱", dialCode: "+48", nationalDigits: 9 },
  portugal: { slug: "portugal", flag: "🇵🇹", dialCode: "+351", nationalDigits: 9 },
  romania: { slug: "romania", flag: "🇷🇴", dialCode: "+40", nationalDigits: 9 },
  ukraine: { slug: "ukraine", flag: "🇺🇦", dialCode: "+380", nationalDigits: 9 },
  russia: { slug: "russia", flag: "🇷🇺", dialCode: "+7", nationalDigits: 10 },
  kazakhstan: { slug: "kazakhstan", flag: "🇰🇿", dialCode: "+7", nationalDigits: 10 },
  turkey: { slug: "turkey", flag: "🇹🇷", dialCode: "+90", nationalDigits: 10 },
  sweden: { slug: "sweden", flag: "🇸🇪", dialCode: "+46", nationalDigits: 9 },
  norway: { slug: "norway", flag: "🇳🇴", dialCode: "+47", nationalDigits: 8 },
  finland: { slug: "finland", flag: "🇫🇮", dialCode: "+358", nationalDigits: 9 },
  denmark: { slug: "denmark", flag: "🇩🇰", dialCode: "+45", nationalDigits: 8 },
  ireland: { slug: "ireland", flag: "🇮🇪", dialCode: "+353", nationalDigits: 9 },
  austria: { slug: "austria", flag: "🇦🇹", dialCode: "+43", nationalDigits: 10 },
  switzerland: { slug: "switzerland", flag: "🇨🇭", dialCode: "+41", nationalDigits: 9 },
  belgium: { slug: "belgium", flag: "🇧🇪", dialCode: "+32", nationalDigits: 9 },
  greece: { slug: "greece", flag: "🇬🇷", dialCode: "+30", nationalDigits: 10 },
  "czech republic": { slug: "czech-republic", flag: "🇨🇿", dialCode: "+420", nationalDigits: 9 },
  hungary: { slug: "hungary", flag: "🇭🇺", dialCode: "+36", nationalDigits: 9 },
  india: { slug: "india", flag: "🇮🇳", dialCode: "+91", nationalDigits: 10 },
  indonesia: { slug: "indonesia", flag: "🇮🇩", dialCode: "+62", nationalDigits: 11 },
  philippines: { slug: "philippines", flag: "🇵🇭", dialCode: "+63", nationalDigits: 10 },
  vietnam: { slug: "vietnam", flag: "🇻🇳", dialCode: "+84", nationalDigits: 9 },
  thailand: { slug: "thailand", flag: "🇹🇭", dialCode: "+66", nationalDigits: 9 },
  malaysia: { slug: "malaysia", flag: "🇲🇾", dialCode: "+60", nationalDigits: 9 },
  singapore: { slug: "singapore", flag: "🇸🇬", dialCode: "+65", nationalDigits: 8 },
  pakistan: { slug: "pakistan", flag: "🇵🇰", dialCode: "+92", nationalDigits: 10 },
  bangladesh: { slug: "bangladesh", flag: "🇧🇩", dialCode: "+880", nationalDigits: 10 },
  china: { slug: "china", flag: "🇨🇳", dialCode: "+86", nationalDigits: 11 },
  japan: { slug: "japan", flag: "🇯🇵", dialCode: "+81", nationalDigits: 10 },
  "south korea": { slug: "south-korea", flag: "🇰🇷", dialCode: "+82", nationalDigits: 10 },
  "hong kong": { slug: "hong-kong", flag: "🇭🇰", dialCode: "+852", nationalDigits: 8 },
  taiwan: { slug: "taiwan", flag: "🇹🇼", dialCode: "+886", nationalDigits: 9 },
  israel: { slug: "israel", flag: "🇮🇱", dialCode: "+972", nationalDigits: 9 },
  "saudi arabia": { slug: "saudi-arabia", flag: "🇸🇦", dialCode: "+966", nationalDigits: 9 },
  "united arab emirates": { slug: "uae", flag: "🇦🇪", dialCode: "+971", nationalDigits: 9 },
  uae: { slug: "uae", flag: "🇦🇪", dialCode: "+971", nationalDigits: 9 },
  qatar: { slug: "qatar", flag: "🇶🇦", dialCode: "+974", nationalDigits: 8 },
  iraq: { slug: "iraq", flag: "🇮🇶", dialCode: "+964", nationalDigits: 10 },
  brazil: { slug: "brazil", flag: "🇧🇷", dialCode: "+55", nationalDigits: 11 },
  mexico: { slug: "mexico", flag: "🇲🇽", dialCode: "+52", nationalDigits: 10 },
  argentina: { slug: "argentina", flag: "🇦🇷", dialCode: "+54", nationalDigits: 10 },
  colombia: { slug: "colombia", flag: "🇨🇴", dialCode: "+57", nationalDigits: 10 },
  chile: { slug: "chile", flag: "🇨🇱", dialCode: "+56", nationalDigits: 9 },
  peru: { slug: "peru", flag: "🇵🇪", dialCode: "+51", nationalDigits: 9 },
  ecuador: { slug: "ecuador", flag: "🇪🇨", dialCode: "+593", nationalDigits: 9 },
  australia: { slug: "australia", flag: "🇦🇺", dialCode: "+61", nationalDigits: 9 },
  "new zealand": { slug: "new-zealand", flag: "🇳🇿", dialCode: "+64", nationalDigits: 9 },
  morocco: { slug: "morocco", flag: "🇲🇦", dialCode: "+212", nationalDigits: 9 },
  algeria: { slug: "algeria", flag: "🇩🇿", dialCode: "+213", nationalDigits: 9 },
  ethiopia: { slug: "ethiopia", flag: "🇪🇹", dialCode: "+251", nationalDigits: 9 },
  "dr congo": { slug: "dr-congo", flag: "🇨🇩", dialCode: "+243", nationalDigits: 9 },
};

/**
 * Lowercase, hyphenated, ascii-safe. Used to derive a slug for a country the
 * table above does not recognise, so nothing the supplier reports is ever
 * dropped for want of a nicer name.
 */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Turns whatever name a supplier gives one country into the shape the rest
 * of Xencodes displays. Recognised names get a real flag and dial code;
 * anything else still sells, under a generic globe and best-effort digit
 * count, because a country that is genuinely for sale is never hidden just
 * because this table has not been taught its flag yet.
 */
export function resolveCountryMeta(name: string): ProviderCountry {
  const key = name.trim().toLowerCase();
  const known = COUNTRY_META[key];
  if (known) return { slug: known.slug, name, flag: known.flag, dialCode: known.dialCode, nationalDigits: known.nationalDigits };

  return {
    slug: slugify(name) || `country-${Math.abs(hashCode(name))}`,
    name,
    flag: "🌍",
    dialCode: "",
    nationalDigits: 10,
  };
}

function hashCode(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

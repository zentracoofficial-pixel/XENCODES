import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { getCountryCallingCode, getExampleNumber } from "libphonenumber-js";
import mobileExamples from "libphonenumber-js/examples.mobile.json";
import type { ProviderCountry } from "./types";

countries.registerLocale(enLocale);

/**
 * Display metadata for real countries: a flag, a dial code, and how many
 * digits a national number typically runs to. This is not inventory. A
 * supplier in this API family reports a country's name and nothing else
 * about how to display it, so this file exists purely to render a name
 * Xencodes already received from the supplier a little better. The
 * displayed name itself is always exactly what the supplier sent; nothing
 * here ever substitutes a different one.
 *
 * The flag and dial code are not a hand-typed table of a few dozen
 * countries. Both are derived from the ISO 3166-1 alpha-2 code once a
 * supplier's name is resolved to one, using i18n-iso-countries for the
 * name lookup (the ISO standard's own English names, ~250 entries) and
 * libphonenumber-js for the calling code and an example national number
 * length. A flag emoji is not an asset to author: it is two Unicode
 * regional indicator symbols computed from the alpha-2 code, which is
 * what flagFromIso2() below does, so every one of those ~250 countries
 * gets a correct flag automatically rather than needing its own entry in
 * a table someone has to keep adding to.
 *
 * The one real gap a static ISO-3166 lookup has is that suppliers in this
 * API family often use an informal or older name (Burma, not Myanmar;
 * DR Congo, not "Congo, Democratic Republic of the"; UK, not "United
 * Kingdom of Great Britain and Northern Ireland"). ALIASES below is a
 * short, static list of exactly those known real-world naming quirks,
 * mapped to a name or code the ISO lookup does recognise. It is not a
 * per-country data table like the one this replaced: most of the ~250
 * countries need no entry here at all, because their supplier name and
 * ISO name already agree.
 *
 * Nothing here decides whether a country is for sale: that is entirely
 * the supplier's live answer. A name this cannot resolve to an ISO code
 * is still sold, under a generic globe and a best-effort digit count, in
 * resolveCountryMeta()'s fallback: a country genuinely for sale is never
 * hidden just because its name does not parse.
 */
const ALIASES: Record<string, string> = {
  burma: "Myanmar",
  "dr congo": "Democratic Republic of the Congo",
  "d.r. congo": "Democratic Republic of the Congo",
  "democratic republic of congo": "Democratic Republic of the Congo",
  "congo, democratic republic of the": "Democratic Republic of the Congo",
  "congo-kinshasa": "Democratic Republic of the Congo",
  "congo kinshasa": "Democratic Republic of the Congo",
  "congo brazzaville": "Republic of the Congo",
  "congo-brazzaville": "Republic of the Congo",
  macedonia: "North Macedonia",
  swaziland: "Eswatini",
  "east timor": "Timor-Leste",
  "timor leste": "Timor-Leste",
  micronesia: "Micronesia, Federated States of",
  moldova: "Moldova, Republic of",
  brunei: "Brunei Darussalam",
  macau: "Macao",
  laos: "Lao People's Democratic Republic",
  vatican: "Holy See",
  "vatican city": "Holy See",
  "st. lucia": "Saint Lucia",
  "st lucia": "Saint Lucia",
  "st. vincent and the grenadines": "Saint Vincent and the Grenadines",
  "st vincent": "Saint Vincent and the Grenadines",
  "cabo verde": "Cape Verde",
  "viet nam": "Vietnam",
  britain: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  "korea, south": "South Korea",
  "korea, north": "North Korea",
  "curacao": "Curaçao",
  "sint maarten": "Sint Maarten (Dutch part)",
  "us virgin islands": "United States Virgin Islands",
  "u.s. virgin islands": "United States Virgin Islands",
  "british virgin islands": "Virgin Islands, British",
  "turks and caicos": "Turks and Caicos Islands",
  bosnia: "Bosnia and Herzegovina",
  trinidad: "Trinidad and Tobago",
  antigua: "Antigua and Barbuda",
  "the bahamas": "Bahamas",
  "sao tome": "Sao Tome and Principe",
};

const NAME_TO_ISO2 = new Map<string, string>();
for (const [alpha2, names] of Object.entries(
  countries.getNames("en", { select: "all" }) as Record<string, string[]>,
)) {
  for (const name of names) NAME_TO_ISO2.set(name.toLowerCase(), alpha2);
}

/** Two Unicode regional indicator symbols, which every flag emoji actually
 *  is: not an asset, a formula on the alpha-2 code. */
function flagFromIso2(iso2: string): string {
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)),
  );
}

function resolveIso2(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;

  const direct = NAME_TO_ISO2.get(key);
  if (direct) return direct;

  const aliased = ALIASES[key];
  if (aliased) {
    const viaAlias = NAME_TO_ISO2.get(aliased.toLowerCase());
    if (viaAlias) return viaAlias;
  }

  // "Korea, South" style names some APIs in this family use: try the two
  // halves the other way around before giving up.
  const commaMatch = key.match(/^(.+),\s*(.+)$/);
  if (commaMatch) {
    const reordered = `${commaMatch[2]} ${commaMatch[1]}`.trim();
    const viaReorder = NAME_TO_ISO2.get(reordered);
    if (viaReorder) return viaReorder;
  }

  return null;
}

/**
 * Lowercase, hyphenated, ascii-safe. Used for every country's slug, known
 * or not, so a supplier renaming or re-casing a country between calls
 * (a real thing this API family does) does not change what it sells
 * under.
 */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FALLBACK_NATIONAL_DIGITS = 10;

/**
 * Turns whatever name a supplier gives one country into the shape the rest
 * of Xencodes displays. A name that resolves to a real ISO 3166-1 country
 * gets its real flag and dial code, computed rather than looked up in a
 * hand-typed table; anything else still sells, under a generic globe and a
 * best-effort digit count, because a country that is genuinely for sale is
 * never hidden just because this could not place its name.
 */
export function resolveCountryMeta(name: string): ProviderCountry {
  const slug = slugify(name) || `country-${Math.abs(hashCode(name))}`;
  const iso2 = resolveIso2(name);

  if (iso2) {
    let dialCode = "";
    let nationalDigits = FALLBACK_NATIONAL_DIGITS;
    try {
      dialCode = `+${getCountryCallingCode(iso2 as never)}`;
    } catch {
      // A handful of ISO entries (Antarctica and similar) have no calling
      // code at all. Left blank rather than guessed.
    }
    try {
      const example = getExampleNumber(iso2 as never, mobileExamples);
      if (example) nationalDigits = example.nationalNumber.length;
    } catch {
      // Keep the fallback length; a display hint, not a validation rule.
    }

    return { slug, name, flag: flagFromIso2(iso2), dialCode, nationalDigits };
  }

  return {
    slug,
    name,
    flag: "🌍",
    dialCode: "",
    nationalDigits: FALLBACK_NATIONAL_DIGITS,
  };
}

export interface VariantSource {
  /** The provider's own, real country id — never altered or collapsed. */
  providerCountryId: string;
  /** Exactly what the provider calls this id right now. */
  name: string;
}

export interface VariantLabel {
  slug: string;
  name: string;
}

/**
 * Deterministically labels a set of a provider's own country ids for one
 * exact context (one service's current price list) so two ids the provider
 * happens to report under the identical name right now — a real, separately
 * priced and stocked pool each, not a data error, see
 * src/lib/country-variant.ts's own header — both stay distinguishable and
 * sellable instead of one colliding with (and silently hiding) the other.
 *
 * Grouped purely by the literal name each id carries right now: a genuine
 * "(2)"-suffixed name the provider already sends forms its own one-member
 * group and passes through completely unchanged. Only an actual collision
 * (two or more ids sharing one literal name) gets a synthesized "(N)"
 * suffix, assigned by ascending numeric provider id — the lowest id keeps
 * the plain name, each next one is labelled "(2)", "(3)", and so on. A
 * global used-slugs guard means a synthesized "(2)" can never collide with
 * a *different* id the provider already names "(2)" on its own.
 *
 * This is the one place that assignment is ever made. src/lib/provider/
 * grizzlysms.ts calls it both when listing a service's countries (so the
 * second pool is visible at all) and when resolving a country slug back to
 * a real id to buy (so a synthesized slug is never a dead end) — always
 * with the same candidate set (every id currently priced for that one
 * service), so a label produced one call is always reversible from an
 * identically-scoped later call, however close together or far apart they
 * run.
 */
export function assignVariantLabels(candidates: VariantSource[]): Map<string, VariantLabel> {
  const byName = new Map<string, VariantSource[]>();
  for (const candidate of candidates) {
    const baseSlug = slugify(candidate.name);
    const group = byName.get(baseSlug);
    if (group) group.push(candidate);
    else byName.set(baseSlug, [candidate]);
  }

  const usedSlugs = new Set<string>();
  const result = new Map<string, VariantLabel>();
  for (const [baseSlug, group] of byName) {
    const sorted = [...group].sort(
      (a, b) => Number(a.providerCountryId) - Number(b.providerCountryId),
    );
    for (const candidate of sorted) {
      let suffix = 1;
      let slug = baseSlug;
      while (usedSlugs.has(slug)) {
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }
      usedSlugs.add(slug);
      result.set(candidate.providerCountryId, {
        slug,
        name: suffix === 1 ? candidate.name : `${candidate.name} (${suffix})`,
      });
    }
  }
  return result;
}

function hashCode(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

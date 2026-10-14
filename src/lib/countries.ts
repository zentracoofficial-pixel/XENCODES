import { normalizeCountryCode } from "@/lib/currency-meta";

/**
 * Every country a customer can say they are in. The list is only ISO 3166
 * codes; names come from the runtime's own region data so there is no
 * hand-typed list of names to drift. A country decides which funding option
 * is eligible (server side) and the default display currency; it is never
 * inferred from a display-currency choice.
 */
const ISO2 =
  "AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );

export interface Country {
  iso2: string;
  name: string;
}

let cached: Country[] | null = null;

export function allCountries(): Country[] {
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    names = null;
  }
  cached = ISO2.map((iso2) => ({ iso2, name: names?.of(iso2) ?? iso2 })).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
  return cached;
}

export function isKnownCountry(value: string | null | undefined): boolean {
  const iso2 = normalizeCountryCode(value);
  return iso2 !== null && ISO2.includes(iso2);
}

export function countryName(value: string | null | undefined): string | null {
  const iso2 = normalizeCountryCode(value);
  if (!iso2) return null;
  return allCountries().find((c) => c.iso2 === iso2)?.name ?? iso2;
}

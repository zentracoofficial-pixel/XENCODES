import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { flagIso2 } from "../src/lib/flag";
import { resolveCountryMeta } from "../src/lib/provider/country-meta";

test("a flag emoji is turned back into its country code; anything else is not a flag", () => {
  assert.equal(flagIso2("🇺🇸"), "us");
  assert.equal(flagIso2("🇬🇧"), "gb");
  assert.equal(flagIso2("🌍"), null);
  assert.equal(flagIso2(""), null);
  assert.equal(flagIso2(null), null);
});

test("USA, UK and the 'virtual' / repeat listings all get their own country's flag", () => {
  for (const [name, iso2, dial] of [
    ["USA", "us", "+1"],
    ["United States", "us", "+1"],
    ["United States (Virtual)", "us", "+1"],
    ["USA (virtual)", "us", "+1"],
    ["USA (2)", "us", "+1"],
    ["United Kingdom", "gb", "+44"],
    ["United Kingdom (2)", "gb", "+44"],
    ["UK", "gb", "+44"],
    ["England", "gb", "+44"],
    ["Canada (Virtual)", "ca", "+1"],
  ] as const) {
    const meta = resolveCountryMeta(name);
    assert.equal(flagIso2(meta.flag), iso2, name);
    assert.equal(meta.dialCode, dial, name);
  }
});

test("every country Xencodes can resolve has a flag picture to show", () => {
  for (const name of ["USA", "United Kingdom", "Nigeria", "Kosovo", "Ivory Coast", "Hong Kong", "Taiwan", "Palestine", "Macau", "Vietnam"]) {
    const iso2 = flagIso2(resolveCountryMeta(name).flag);
    assert.ok(iso2 && existsSync(new URL(`../public/flags/${iso2}.svg`, import.meta.url)), `${name} (${iso2})`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { allCountries, countryName } from "../src/lib/countries";

test("country names are fixed text, not the runtime's own region data", () => {
  // Node says "Hong Kong SAR China" and Chrome says "Hong Kong"; a list that
  // differs between the two makes a page fail to hydrate.
  assert.equal(countryName("HK"), "Hong Kong");
  assert.equal(countryName("MO"), "Macao");
  assert.equal(countryName("PS"), "Palestine");
  assert.equal(countryName("FK"), "Falkland Islands");
  assert.equal(countryName("us"), "United States");
});

test("every country in the list has a real name, sorted A to Z", () => {
  const list = allCountries();
  assert.ok(list.length > 200);
  for (const country of list) assert.notEqual(country.name, country.iso2, country.iso2);
  const names = list.map((country) => country.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")));
});

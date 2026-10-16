import test from "node:test";
import assert from "node:assert/strict";
import { countryFaqs, pairFaqs, serviceFaqs, REFUND_SENTENCE } from "../src/lib/seo-copy";
import { GUIDES } from "../src/data/guides";
import { SERVICE_PAGES } from "../src/data/service-pages";

// "does not guarantee" is an honest limit, so only an unqualified promise counts.
const PROMISES = /(?<!not )(?<!not a )guarantee|100%|always works|instant(ly)? delivery|never fails|non-?voip/i;

test("page copy makes no promise the product cannot keep, and always states the refund rule", () => {
  const all = [
    ...serviceFaqs({ name: "WhatsApp", countryCount: 40, fromUsd: "$0.40", exampleCountries: ["USA", "UK"] }),
    ...countryFaqs({ country: "Canada", dialCode: "+1", serviceCount: 90, examples: ["WhatsApp"] }),
    ...pairFaqs({ service: "Telegram", country: "Spain", dialCode: "+34", fromUsd: "$0.50", nationalDigits: 9 }),
  ];
  for (const item of all) assert.doesNotMatch(item.question + item.answer, PROMISES, item.question);
  assert.ok(all.some((item) => item.answer.includes(REFUND_SENTENCE)));
});

test("every guide is complete, unique and free of supplier names and over-promises", () => {
  const slugs = new Set<string>();
  for (const guide of GUIDES) {
    assert.ok(!slugs.has(guide.slug), `duplicate slug ${guide.slug}`);
    slugs.add(guide.slug);
    assert.match(guide.slug, /^[a-z0-9-]+$/);
    assert.ok(guide.metaTitle.length <= 48, `${guide.slug} title too long for a search result (with the site name it must stay near 60) (${guide.metaTitle.length})`);
    assert.ok(guide.description.length >= 80 && guide.description.length <= 170, `${guide.slug} description length ${guide.description.length}`);
    assert.ok(guide.sections.length >= 3 && guide.faq.length >= 1);
    const words = guide.sections.reduce((n, section) => n + [...section.paragraphs, ...(section.bullets ?? [])].join(" ").split(/\s+/).length, 0);
    assert.ok(words >= 250, `${guide.slug} is too thin to be worth a page (${words} words)`);
    const text = JSON.stringify(guide);
    assert.doesNotMatch(text, /grizzly|dogesms|server i\b|server ii\b/i, guide.slug);
    assert.doesNotMatch(text, PROMISES, guide.slug);
    for (const service of guide.relatedServices) assert.ok(SERVICE_PAGES.some((page) => page.slug === service), `${guide.slug} links to unknown service ${service}`);
  }
  assert.ok(GUIDES.length >= 10);
});

test("curated service pages say nothing that sounds like a guarantee", () => {
  for (const page of SERVICE_PAGES) {
    assert.doesNotMatch(JSON.stringify(page), PROMISES, page.slug);
    assert.ok(page.limitations.length >= 2, page.slug);
  }
});

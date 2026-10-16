import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqSection, LinkGrid } from "@/components/seo/blocks";
import { GUIDES, getGuide } from "@/data/guides";
import { getServicePageContent } from "@/data/service-pages";
import { SITE_NAME, SITE_URL, ORGANIZATION_REF } from "@/lib/site";

// Built once and served from the cache: nothing here depends on who is looking.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: guide.metaTitle,
    description: guide.description,
    alternates: { canonical: `/guides/${slug}` },
    openGraph: { type: "article", title: guide.metaTitle, description: guide.description, publishedTime: guide.published },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  const others = GUIDES.filter((entry) => entry.slug !== slug).slice(0, 6);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.description,
          datePublished: guide.published,
          dateModified: guide.published,
          mainEntityOfPage: `${SITE_URL}/guides/${slug}`,
          author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
          publisher: ORGANIZATION_REF,
        }}
      />
      <PageHero
        crumbs={[{ label: "Guides", href: "/guides" }, { label: guide.category }]}
        eyebrow={`${guide.category} · ${guide.readingMinutes} min read`}
        title={guide.title}
        description={guide.intro}
      />
      <Container className="py-12 sm:py-16">
        <article className="mx-auto max-w-3xl">
          {guide.sections.map((section) => (
            <section key={section.heading} className="mb-9">
              <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-muted-foreground marker:text-mint">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <FaqSection items={guide.faq} />

          {guide.relatedServices.length > 0 ? (
            <LinkGrid
              title="Try it for a service"
              items={guide.relatedServices.map((service) => ({
                href: `/services/${service}`,
                label: `${getServicePageContent(service)?.name ?? service} virtual number`,
                hint: "See countries and live prices",
              }))}
              moreHref="/countries"
              moreLabel="Browse by country"
            />
          ) : null}

          <LinkGrid
            title="More guides"
            items={others.map((entry) => ({ href: `/guides/${entry.slug}`, label: entry.title, hint: `${entry.readingMinutes} min read` }))}
            moreHref="/guides"
            moreLabel="All guides"
          />

          <p className="mt-8 text-xs text-muted-foreground">
            Numbers are for receiving verification codes on accounts you own.{" "}
            <Link href="/terms" className="underline underline-offset-4">
              Terms
            </Link>
            .
          </p>
          <CtaBand title="Get a virtual number" body="Choose a service and country and pay only for codes that arrive." />
        </article>
      </Container>
    </>
  );
}

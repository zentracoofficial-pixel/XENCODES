import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { blogArticles } from "@/data/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Educational articles about SMS verification, virtual numbers, and developer infrastructure from the Xencodes team.",
};

export default function BlogPage() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Blog"
          title="Guides and updates"
          description="Educational articles about SMS verification, virtual numbers, and developer infrastructure."
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {blogArticles.map((article) => (
            <Link key={article.slug} href={`/blog/${article.slug}`} className="block group">
              <Card className="h-full p-6 transition-colors group-hover:border-primary/40 group-hover:bg-secondary">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{article.category}</Badge>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <h2 className="mt-4 text-lg font-semibold leading-snug">
                  {article.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {article.excerpt}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {new Date(article.publishedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  &middot; {article.readTime}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </Container>
    </Section>
  );
}

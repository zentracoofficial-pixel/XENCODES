import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { blogArticles, getArticleBySlug } from "@/data/blog";

export function generateStaticParams() {
  return blogArticles.map((article) => ({ article: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ article: string }>;
}): Promise<Metadata> {
  const { article: slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.excerpt,
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ article: string }>;
}) {
  const { article: slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <Section>
      <Container>
        <div className="mx-auto max-w-2xl">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to blog
          </Link>

          <Badge variant="outline" className="mt-6">
            {article.category}
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance">
            {article.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {new Date(article.publishedAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            &middot; {article.readTime}
          </p>

          <div className="mt-8 space-y-5 text-base leading-relaxed text-foreground/90">
            {article.content.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}

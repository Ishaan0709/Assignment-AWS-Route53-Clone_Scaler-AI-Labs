import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";
import { RESOLVER_PAGES } from "@/lib/constants";

interface Params {
  params: Promise<{ slug: string[] }>;
}

function titleFor(slug: string[]): string | undefined {
  return slug.length === 1 && slug[0] !== undefined ? RESOLVER_PAGES[slug[0]] : undefined;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { title: titleFor(slug) ?? "Resolver" };
}

export default async function ResolverPage({ params }: Params) {
  const { slug } = await params;
  const title = titleFor(slug);
  if (!title) notFound();
  return <PagePlaceholder title={title} breadcrumbs={[{ text: "Resolver" }, { text: title }]} />;
}

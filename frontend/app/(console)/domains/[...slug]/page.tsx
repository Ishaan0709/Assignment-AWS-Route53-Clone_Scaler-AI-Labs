import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/common/ComingSoon";
import { DOMAIN_PAGES } from "@/lib/constants";

interface Params {
  params: Promise<{ slug: string[] }>;
}

function titleFor(slug: string[]): string | undefined {
  return slug.length === 1 && slug[0] !== undefined ? DOMAIN_PAGES[slug[0]] : undefined;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { title: titleFor(slug) ?? "Domains" };
}

export default async function DomainsPage({ params }: Params) {
  const { slug } = await params;
  const title = titleFor(slug);
  if (!title) notFound();
  return <ComingSoon title={title} breadcrumbs={[{ text: "Domains" }, { text: title }]} />;
}

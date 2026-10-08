import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = { title: "Profiles" };

export default function ProfilesPage() {
  return <PagePlaceholder title="Profiles" breadcrumbs={[{ text: "Profiles" }]} />;
}

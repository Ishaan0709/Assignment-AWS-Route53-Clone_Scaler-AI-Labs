import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = { title: "Hosted zones" };

export default function HostedZonesPage() {
  return (
    <PagePlaceholder
      title="Hosted zones"
      breadcrumbs={[{ text: "Hosted zones" }]}
      description="A hosted zone is a container for records, which include information about how to route traffic for a domain and its subdomains."
    />
  );
}

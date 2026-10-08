import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PagePlaceholder
      title="Dashboard"
      breadcrumbs={[{ text: "Dashboard" }]}
      description="Overview of your Route 53 resources."
    />
  );
}

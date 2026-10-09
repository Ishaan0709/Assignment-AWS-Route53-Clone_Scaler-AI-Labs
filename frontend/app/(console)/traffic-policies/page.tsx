import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/ComingSoon";

export const metadata: Metadata = { title: "Traffic policies" };

export default function TrafficPoliciesPage() {
  return (
    <ComingSoon
      title="Traffic policies"
      breadcrumbs={[{ text: "Traffic flow" }, { text: "Traffic policies" }]}
    />
  );
}

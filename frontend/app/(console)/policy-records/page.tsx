import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/ComingSoon";

export const metadata: Metadata = { title: "Policy records" };

export default function PolicyRecordsPage() {
  return (
    <ComingSoon
      title="Policy records"
      breadcrumbs={[{ text: "Traffic flow" }, { text: "Policy records" }]}
    />
  );
}

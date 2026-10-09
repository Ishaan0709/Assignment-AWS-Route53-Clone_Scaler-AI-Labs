import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/ComingSoon";

export const metadata: Metadata = { title: "Profiles" };

export default function ProfilesPage() {
  return <ComingSoon title="Profiles" breadcrumbs={[{ text: "Profiles" }]} />;
}

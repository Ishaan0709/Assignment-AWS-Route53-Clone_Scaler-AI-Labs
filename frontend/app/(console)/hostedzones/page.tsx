import type { Metadata } from "next";
import { ZonesPage } from "@/components/zones/ZonesPage";

export const metadata: Metadata = { title: "Hosted zones" };

export default function HostedZonesPage() {
  return <ZonesPage />;
}

import type { Metadata } from "next";
import { ZoneDetailPage } from "@/components/zones/ZoneDetailPage";

interface Params {
  params: Promise<{ zoneId: string }>;
}

export const metadata: Metadata = { title: "Hosted zone details" };

export default async function HostedZoneDetailRoute({ params }: Params) {
  const { zoneId } = await params;
  return <ZoneDetailPage zoneId={zoneId} />;
}

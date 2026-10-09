import type { Metadata } from "next";
import { CreateRecordPage } from "@/components/records/CreateRecordPage";

interface Params {
  params: Promise<{ zoneId: string }>;
}

export const metadata: Metadata = { title: "Create record" };

export default async function CreateRecordRoute({ params }: Params) {
  const { zoneId } = await params;
  return <CreateRecordPage zoneId={zoneId} />;
}

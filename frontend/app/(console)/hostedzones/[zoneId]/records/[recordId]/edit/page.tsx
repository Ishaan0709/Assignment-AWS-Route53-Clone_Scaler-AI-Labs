import type { Metadata } from "next";
import { EditRecordPage } from "@/components/records/EditRecordPage";

interface Params {
  params: Promise<{ zoneId: string; recordId: string }>;
}

export const metadata: Metadata = { title: "Edit record" };

export default async function EditRecordRoute({ params }: Params) {
  const { zoneId, recordId } = await params;
  const id = Number(recordId);
  return <EditRecordPage zoneId={zoneId} recordId={Number.isInteger(id) ? id : Number.NaN} />;
}

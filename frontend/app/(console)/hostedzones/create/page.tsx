import type { Metadata } from "next";
import { CreateZonePage } from "@/components/zones/CreateZonePage";

export const metadata: Metadata = { title: "Create hosted zone" };

export default function CreateHostedZonePage() {
  return <CreateZonePage />;
}

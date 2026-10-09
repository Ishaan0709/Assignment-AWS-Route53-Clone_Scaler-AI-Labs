"use client";

import { useRouter } from "next/navigation";
import { ConsolePage } from "@/components/layout/ConsolePage";
import { ZoneForm } from "@/components/zones/ZoneForm";
import { useNotifications } from "@/hooks/useNotifications";
import { useCreateZone } from "@/hooks/useZones";
import { ROUTES } from "@/lib/constants";
import { displayName } from "@/lib/format";
import type { HostedZoneCreate } from "@/types/api";

export function CreateZonePage() {
  const router = useRouter();
  const notify = useNotifications();
  const create = useCreateZone();

  const onSubmit = async (payload: HostedZoneCreate) => {
    const zone = await create.mutateAsync(payload);
    notify.success(`${displayName(zone.name)} was successfully created.`);
    router.push(ROUTES.hostedZone(zone.id));
  };

  return (
    <ConsolePage
      title="Create hosted zone"
      description="A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains."
      breadcrumbs={[
        { text: "Hosted zones", href: ROUTES.hostedZones },
        { text: "Create hosted zone" },
      ]}
    >
      <ZoneForm
        onSubmit={onSubmit}
        onCancel={() => router.push(ROUTES.hostedZones)}
        submitting={create.isPending || create.isSuccess}
      />
    </ConsolePage>
  );
}

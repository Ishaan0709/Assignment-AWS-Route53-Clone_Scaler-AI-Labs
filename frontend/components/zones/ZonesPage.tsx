"use client";

import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { DeleteZoneModal } from "@/components/zones/DeleteZoneModal";
import { EditZoneModal } from "@/components/zones/EditZoneModal";
import { ZonesTable } from "@/components/zones/ZonesTable";
import { ROUTES } from "@/lib/constants";
import type { HostedZone } from "@/types/api";

type ModalKind = "edit" | "delete" | null;

/** `/hostedzones`: table with selection-driven actions plus the edit and delete modals. */
export function ZonesPage() {
  const router = useRouter();
  const [selectedZone, setSelectedZone] = useState<HostedZone | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const onSelectionChange = useCallback((zone: HostedZone | null) => setSelectedZone(zone), []);

  const createButton = (
    <Button
      variant="primary"
      onClick={() => router.push(ROUTES.createHostedZone)}
      data-testid="create-zone"
    >
      Create hosted zone
    </Button>
  );

  return (
    <ContentLayout breadcrumbs={<Breadcrumbs items={[{ text: "Hosted zones" }]} />}>
      <ZonesTable
        selectedZone={selectedZone}
        onSelectionChange={onSelectionChange}
        emptyAction={createButton}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              disabled={!selectedZone}
              onClick={() => selectedZone && router.push(ROUTES.hostedZone(selectedZone.id))}
              data-testid="view-zone"
            >
              View details
            </Button>
            <Button
              disabled={!selectedZone}
              onClick={() => setModal("edit")}
              data-testid="edit-zone"
            >
              Edit
            </Button>
            <Button
              disabled={!selectedZone}
              onClick={() => setModal("delete")}
              data-testid="delete-zone"
            >
              Delete
            </Button>
            {createButton}
          </SpaceBetween>
        }
      />
      <EditZoneModal
        zone={modal === "edit" ? selectedZone : null}
        onDismiss={closeModal}
        onSaved={setSelectedZone}
      />
      <DeleteZoneModal
        zone={modal === "delete" ? selectedZone : null}
        onDismiss={closeModal}
        onDeleted={() => setSelectedZone(null)}
      />
    </ContentLayout>
  );
}

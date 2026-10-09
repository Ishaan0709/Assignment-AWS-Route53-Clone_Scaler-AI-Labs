"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Icon from "@cloudscape-design/components/icon";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useRouter } from "next/navigation";
import type { Crumb } from "@/components/layout/Breadcrumbs";
import { ConsolePage } from "@/components/layout/ConsolePage";
import { ROUTES } from "@/lib/constants";

interface ComingSoonProps {
  title: string;
  breadcrumbs: Crumb[];
}

/** Shared stand-in for every navigation target that this clone does not implement. */
export function ComingSoon({ title, breadcrumbs }: ComingSoonProps) {
  const router = useRouter();
  return (
    <ConsolePage title={title} breadcrumbs={breadcrumbs}>
      <Container data-testid="coming-soon">
        <Box textAlign="center" padding={{ vertical: "xxl" }}>
          <SpaceBetween size="m" alignItems="center">
            <Icon name="status-info" size="large" />
            <Box variant="p" color="text-body-secondary">
              This feature is coming soon.
            </Box>
            <Button onClick={() => router.push(ROUTES.hostedZones)}>Back to Hosted zones</Button>
          </SpaceBetween>
        </Box>
      </Container>
    </ConsolePage>
  );
}

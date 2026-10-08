"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useQuery } from "@tanstack/react-query";

interface HealthResponse {
  status: string;
  service: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health", { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Backend responded with ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

/** Temporary scaffold page; replaced by the console in a later phase. */
export default function HomePage() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  return (
    <Box padding="xxl">
      <Container header={<Header variant="h1">Route 53 clone scaffold</Header>}>
        <SpaceBetween size="m">
          <Box variant="p">
            Next.js, Cloudscape and TanStack Query are wired up. The status below is fetched from
            the FastAPI backend through the <code>/api</code> rewrite proxy.
          </Box>
          {health.isPending && <StatusIndicator type="loading">Checking backend</StatusIndicator>}
          {health.isError && (
            <Alert type="error" header="Backend unreachable">
              {health.error.message}
            </Alert>
          )}
          {health.isSuccess && (
            <StatusIndicator type="success">
              {health.data.service}: {health.data.status}
            </StatusIndicator>
          )}
        </SpaceBetween>
      </Container>
    </Box>
  );
}

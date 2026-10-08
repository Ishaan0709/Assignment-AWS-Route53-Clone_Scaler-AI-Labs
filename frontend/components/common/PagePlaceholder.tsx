"use client";

import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import type { Crumb } from "@/components/layout/Breadcrumbs";
import { ConsolePage } from "@/components/layout/ConsolePage";

interface PagePlaceholderProps {
  title: string;
  breadcrumbs: Crumb[];
  description?: string;
}

/** Minimal stand-in page for navigation targets that are built out in later phases. */
export function PagePlaceholder({ title, breadcrumbs, description }: PagePlaceholderProps) {
  return (
    <ConsolePage title={title} breadcrumbs={breadcrumbs} description={description}>
      <Container>
        <Box variant="p" color="text-body-secondary">
          {title} is not available yet in this clone.
        </Box>
      </Container>
    </ConsolePage>
  );
}

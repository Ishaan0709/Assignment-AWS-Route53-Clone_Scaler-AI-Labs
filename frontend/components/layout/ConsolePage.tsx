"use client";

import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import type { ReactNode } from "react";
import type { Crumb } from "@/components/layout/Breadcrumbs";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

interface ConsolePageProps {
  title: ReactNode;
  /** Optional count shown next to the title, e.g. `(12)`. */
  counter?: string;
  description?: ReactNode;
  breadcrumbs: Crumb[];
  actions?: ReactNode;
  /** Show the AWS-style "Info" link next to the title. */
  info?: boolean;
  children: ReactNode;
}

/** Standard console page: breadcrumbs, h1 header with optional actions, content. */
export function ConsolePage({
  title,
  counter,
  description,
  breadcrumbs,
  actions,
  info = true,
  children,
}: ConsolePageProps) {
  return (
    <ContentLayout
      breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
      header={
        <Header
          variant="h1"
          counter={counter}
          description={description}
          actions={actions}
          info={info ? <Link variant="info">Info</Link> : undefined}
        >
          {title}
        </Header>
      }
    >
      {children}
    </ContentLayout>
  );
}

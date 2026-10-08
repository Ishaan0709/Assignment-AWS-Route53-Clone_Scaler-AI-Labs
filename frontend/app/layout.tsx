import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@cloudscape-design/global-styles/index.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Route 53 Global View",
    template: "%s | Route 53 Global View",
  },
  description: "A functional clone of the AWS Route 53 console.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

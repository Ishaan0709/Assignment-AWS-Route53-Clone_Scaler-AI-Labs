import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@cloudscape-design/global-styles/index.css";
import "./globals.css";
import { APP_TITLE } from "@/lib/constants";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: APP_TITLE,
    template: `%s | ${APP_TITLE}`,
  },
  description: "A functional clone of the AWS Route 53 console.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* The theme boot script toggles the dark-mode class before hydration. */}
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

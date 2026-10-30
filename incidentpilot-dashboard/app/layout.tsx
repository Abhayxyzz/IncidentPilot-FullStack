import "./globals.css";
import type { ReactNode } from "react";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata = {
  title: "IncidentPilot",
  description: "Investigate incidents with evidence, approve the fix, verify recovery.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

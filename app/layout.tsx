import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "./toast";
import { getSession } from "@/lib/session";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = { title: "eve", description: "From repo to production" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Runtime settings for browser telemetry (instrumentation-client.ts); in the initial HTML, not streamed. */}
        <meta name="eve-faro-url" content={process.env.FARO_URL ?? ""} />
        <meta name="eve-version" content={process.env.APP_VERSION ?? "dev"} />
        <meta name="eve-user" content={session?.login ?? ""} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

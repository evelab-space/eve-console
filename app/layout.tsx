import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "./toast";
import { Faro } from "./faro";
import { getSession } from "@/lib/session";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = { title: "eve", description: "From repo to production" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster />
        <Faro url={process.env.FARO_URL ?? ""} version={process.env.APP_VERSION ?? "dev"} user={session?.login} />
      </body>
    </html>
  );
}

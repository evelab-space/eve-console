// Liveness + release check for the delivery pipeline: Kargo's post-deploy verification reads `version`
// to confirm the promoted image is the one actually serving.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", version: process.env.APP_VERSION ?? "dev" });
}

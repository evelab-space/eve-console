import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";

// Starts the GitHub App user authorization (OAuth web flow). The App's installations decide which
// accounts and repositories eve can see.
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.githubClientId());
  url.searchParams.set("redirect_uri", `${config.publicUrl()}/api/auth/callback`);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("eve_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}

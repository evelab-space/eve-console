import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getUser } from "@/lib/github";
import { cookieOptions, SESSION_COOKIE, sealSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("eve_oauth_state")?.value;
  const home = config.publicUrl();

  // After installing the App on a new account GitHub may return here without a code: just go back.
  if (!code) return NextResponse.redirect(`${home}/projects`);
  if (!state || state !== expected) return NextResponse.redirect(`${home}/?error=state`);

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.githubClientId(),
      client_secret: config.githubClientSecret(),
      code,
      redirect_uri: `${home}/api/auth/callback`,
    }),
    cache: "no-store",
  });
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return NextResponse.redirect(`${home}/?error=token`);

  const user = await getUser(token.access_token);
  const res = NextResponse.redirect(`${home}/projects`);
  res.cookies.set(SESSION_COOKIE, await sealSession({ token: token.access_token, ...user }), cookieOptions);
  res.cookies.delete("eve_oauth_state");
  return res;
}

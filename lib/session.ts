// Stateless session: the user's GitHub user-to-server token lives in an encrypted, httpOnly cookie.
// eve keeps no database for sign-in.
import { EncryptJWT, jwtDecrypt } from "jose";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

export const SESSION_COOKIE = "eve_session";
const MAX_AGE = 8 * 60 * 60; // GitHub App user tokens expire after 8 hours

export type Session = { token: string; login: string; avatar: string };

function key(): Uint8Array {
  return createHash("sha256").update(config.sessionSecret()).digest();
}

export async function sealSession(s: Session): Promise<string> {
  return new EncryptJWT({ ...s })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(key());
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtDecrypt(raw, key());
    return { token: String(payload.token), login: String(payload.login), avatar: String(payload.avatar) };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

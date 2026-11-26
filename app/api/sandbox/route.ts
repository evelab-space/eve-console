// POST {repo}            → start (or reuse) the user's sandbox for that repo; returns its state.
// POST {repo, session?, text} → send a prompt (creates a session on first message).
// GET  ?repo=&session=   → sandbox state and the session's messages.
// DELETE ?repo=          → stop the sandbox.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { event, tag } from "@/lib/telemetry";
import { createSession, deleteSandbox, ensureSandbox, getSandbox, messages, prompt, sandboxName } from "@/lib/sandbox";

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

async function auth(repo: string | null) {
  const user = await getSession();
  if (!user) return { error: NextResponse.json({ error: "signed out" }, { status: 401 }) };
  if (!repo || !REPO.test(repo)) return { error: NextResponse.json({ error: "bad repo" }, { status: 400 }) };
  return { user, repo };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { repo?: string; session?: string; text?: string };
  const a = await auth(body.repo ?? null);
  if ("error" in a) return a.error;
  tag({ "eve.repo": a.repo });
  const sb = await ensureSandbox(a.user.login, a.repo, a.user.token);
  if (!body.text) {
    event("sandbox.started", { user: a.user.login, repo: a.repo, sandbox: sb.name });
    return NextResponse.json({ ready: sb.ready });
  }
  if (!sb.ready) return NextResponse.json({ error: "sandbox starting" }, { status: 409 });
  const session = body.session || (await createSession(sb, body.text.slice(0, 60)));
  await prompt(sb, session, body.text);
  event("agent.prompted", { user: a.user.login, repo: a.repo, session, chars: body.text.length });
  return NextResponse.json({ ready: true, session });
}

export async function GET(req: NextRequest) {
  const a = await auth(req.nextUrl.searchParams.get("repo"));
  if ("error" in a) return a.error;
  const sb = await getSandbox(sandboxName(a.user.login, a.repo));
  if (!sb) return NextResponse.json({ running: false });
  const session = req.nextUrl.searchParams.get("session");
  return NextResponse.json({
    running: true,
    ready: sb.ready,
    messages: sb.ready && session ? await messages(sb, session) : [],
  });
}

export async function DELETE(req: NextRequest) {
  const a = await auth(req.nextUrl.searchParams.get("repo"));
  if ("error" in a) return a.error;
  await deleteSandbox(sandboxName(a.user.login, a.repo));
  return NextResponse.json({ running: false });
}

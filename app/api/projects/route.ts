// POST {repo}                  → import the repository as a project.
// POST {slug, action:"deploy"} → build the default branch's latest commit (deploys when the build succeeds).
// GET  ?slug=&build=           → project, builds, deploy status, URL and (optionally) a build's logs.
import { NextRequest, NextResponse } from "next/server";
import { canAccessRepo, defaultBranchHead } from "@/lib/access";
import { buildDetail } from "@/lib/timeline";
import { deployStatus, getProject, importProject, listBuilds, projectUrl, promoteSucceeded, rollback, startBuild } from "@/lib/projects";
import { getSession } from "@/lib/session";
import { event, tag } from "@/lib/telemetry";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const body = (await req.json()) as { repo?: string; slug?: string; action?: string; sha?: string; deploy?: boolean };

  if (body.repo) {
    if (!(await canAccessRepo(session, body.repo))) return NextResponse.json({ error: "no access to repository" }, { status: 403 });
    const p = await importProject(body.repo, session.login);
    tag({ "eve.project": p.slug, "eve.repo": p.repo });
    event("project.imported", { user: session.login, project: p.slug, repo: p.repo });
    if (body.deploy) {
      // Import & deploy: build the latest commit right away.
      const head = await defaultBranchHead(session.token, p.repo);
      const build = await startBuild(p, head.sha, session.token, head.message);
      event("build.started", { user: session.login, project: p.slug, sha: head.sha, build, via: "import" });
      return NextResponse.json({ slug: p.slug, build });
    }
    return NextResponse.json({ slug: p.slug });
  }

  const p = body.slug ? await getProject(body.slug) : null;
  if (!p) return NextResponse.json({ error: "no such project" }, { status: 404 });
  if (!(await canAccessRepo(session, p.repo))) return NextResponse.json({ error: "no access to repository" }, { status: 403 });
  tag({ "eve.project": p.slug, "eve.repo": p.repo, "eve.action": body.action });
  if (body.action === "deploy") {
    const head = await defaultBranchHead(session.token, p.repo);
    const build = await startBuild(p, head.sha, session.token, head.message);
    event("build.started", { user: session.login, project: p.slug, sha: head.sha, build, via: "deploy" });
    return NextResponse.json({ build, sha: head.sha });
  }
  if (body.action === "rollback" && body.sha) {
    await rollback(p, body.sha);
    event("project.rolled_back", { user: session.login, project: p.slug, sha: body.sha });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  let p = await getProject(slug);
  if (!p) return NextResponse.json({ error: "no such project" }, { status: 404 });
  if (!(await canAccessRepo(session, p.repo))) return NextResponse.json({ error: "no access to repository" }, { status: 403 });
  p = await promoteSucceeded(p);
  const builds = await listBuilds(p.slug);
  const deploy = await deployStatus(p.slug);
  // The timeline shows the requested build, else the newest one.
  const build = req.nextUrl.searchParams.get("build") || builds[0]?.name;
  return NextResponse.json({
    project: p,
    url: projectUrl(p.slug),
    builds,
    deploy,
    detail: build ? await buildDetail(p, build, deploy) : null,
  });
}

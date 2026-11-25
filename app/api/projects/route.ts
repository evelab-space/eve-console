// POST {repo}                  → import the repository as a project.
// POST {slug, action:"deploy"} → build the default branch's latest commit (deploys when the build succeeds).
// GET  ?slug=&build=           → project, builds, deploy status, URL and (optionally) a build's logs.
import { NextRequest, NextResponse } from "next/server";
import { canAccessRepo, defaultBranchSha } from "@/lib/access";
import { buildDetail } from "@/lib/timeline";
import { deployStatus, getProject, importProject, listBuilds, projectUrl, promoteSucceeded, startBuild } from "@/lib/projects";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const body = (await req.json()) as { repo?: string; slug?: string; action?: string };

  if (body.repo) {
    if (!(await canAccessRepo(session, body.repo))) return NextResponse.json({ error: "no access to repository" }, { status: 403 });
    const p = await importProject(body.repo, session.login);
    return NextResponse.json({ slug: p.slug });
  }

  const p = body.slug ? await getProject(body.slug) : null;
  if (!p) return NextResponse.json({ error: "no such project" }, { status: 404 });
  if (!(await canAccessRepo(session, p.repo))) return NextResponse.json({ error: "no access to repository" }, { status: 403 });
  if (body.action === "deploy") {
    const sha = await defaultBranchSha(session.token, p.repo);
    return NextResponse.json({ build: await startBuild(p, sha, session.token), sha });
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

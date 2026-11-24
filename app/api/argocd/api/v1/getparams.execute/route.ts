// Argo CD ApplicationSet plugin generator: one parameter set per built project.
// Argo CD calls this with the shared token (ConfigMap eve-projects-plugin + Secret in argocd).
import { NextRequest, NextResponse } from "next/server";
import { listProjects, projectUrl, tenantNamespace } from "@/lib/projects";

export async function POST(req: NextRequest) {
  const want = `Bearer ${process.env.ARGOCD_PLUGIN_TOKEN ?? ""}`;
  if (!process.env.ARGOCD_PLUGIN_TOKEN || req.headers.get("authorization") !== want) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parameters = (await listProjects())
    .filter((p) => p.image)
    .map((p) => ({
      slug: p.slug,
      owner: p.owner,
      repo: p.repo,
      namespace: tenantNamespace(p.owner),
      image: p.image,
      host: new URL(projectUrl(p.slug)).host,
    }));
  return NextResponse.json({ output: { parameters } });
}

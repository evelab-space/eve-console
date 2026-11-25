import { redirect } from "next/navigation";
import { GitHubAuthError, listOwners } from "@/lib/github";
import { deployStatus, listBuilds, listProjects, projectUrl } from "@/lib/projects";
import { getSession } from "@/lib/session";
import { Nav } from "../nav";

export const dynamic = "force-dynamic";

const dot: Record<string, string> = { Healthy: "bg-green-500", Progressing: "bg-yellow-400", Degraded: "bg-red-500" };

function ago(iso?: string) {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// Home: the user's projects (those owned by accounts where they installed the eve GitHub App).
export default async function Projects() {
  const session = await getSession();
  if (!session) redirect("/");
  let owners: string[] = [];
  try {
    owners = (await listOwners(session.token)).map((o) => o.login.toLowerCase());
  } catch (e) {
    if (e instanceof GitHubAuthError) redirect("/api/auth/login");
    throw e;
  }
  const mine = (await listProjects()).filter((p) => owners.includes(p.owner.toLowerCase()));
  if (mine.length === 0) redirect("/repos");
  const cards = await Promise.all(
    mine.map(async (p) => {
      const [builds, deploy] = await Promise.all([listBuilds(p.slug), deployStatus(p.slug)]);
      return { p, last: builds[0], deploy };
    }),
  );

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Nav session={session} active="projects" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <a href="/repos" className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200">Add new</a>
        </div>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ p, last, deploy }) => {
            const status = !p.image ? (last?.state === "failed" ? "Build failed" : last ? "Building" : "Not deployed") : deploy?.health ?? "Pending";
            const color = !p.image ? (last?.state === "failed" ? "bg-red-500" : last ? "bg-yellow-400" : "bg-neutral-600") : dot[deploy?.health ?? ""] ?? "bg-neutral-600";
            return (
              <li key={p.slug}>
                <a href={`/projects/${p.slug}`} className="block rounded-lg border border-neutral-800 p-4 transition hover:border-neutral-600">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 font-semibold uppercase">{p.repo.split("/")[1][0]}</div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.repo.split("/")[1]}</div>
                      <div className="truncate text-sm text-neutral-500">{new URL(projectUrl(p.slug)).host}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full ${color}`} />
                    <span className="text-neutral-300">{status}</span>
                    {last && <span className="text-neutral-500">· {ago(last.started)}</span>}
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-neutral-500">{p.repo} {last ? `@ ${last.sha.slice(0, 7)}` : ""}</div>
                </a>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

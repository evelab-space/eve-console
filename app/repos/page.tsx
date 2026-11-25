import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { GitHubAuthError, listOwners, listRepos, type Owner, type Repo } from "@/lib/github";
import { getSession } from "@/lib/session";
import { OwnerPicker, RepoList } from "./repo-list";
import { Nav } from "../nav";

export const dynamic = "force-dynamic";

export default async function ReposPage({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const installUrl = `https://github.com/apps/${config.githubAppSlug()}/installations/new`;

  let owners: Owner[] = [];
  let repos: Repo[] = [];
  let selected: Owner | undefined;
  try {
    owners = await listOwners(session.token);
    const { owner } = await searchParams;
    selected = owners.find((o) => o.login === owner) ?? owners[0];
    if (selected) repos = await listRepos(session.token, selected.installationId);
  } catch (e) {
    if (e instanceof GitHubAuthError) redirect("/api/auth/login");
    throw e;
  }

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Nav session={session} active="repos" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Import Git Repository</h1>
        {owners.length === 0 ? (
          <div className="mt-8 rounded-lg border border-neutral-800 p-8 text-center">
            <p className="text-neutral-300">Install the eve GitHub App to choose which repositories eve can see.</p>
            <a href={installUrl} className="mt-4 inline-block rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200">
              Install on GitHub
            </a>
          </div>
        ) : (
          <>
            <div className="mt-6">
              <OwnerPicker owners={owners} selected={selected!.login} installUrl={installUrl} />
            </div>
            <RepoList repos={repos} configureUrl={installUrl} />
          </>
        )}
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { GitHubAuthError, listOwners, listRepos, type Owner, type Repo } from "@/lib/github";
import { getSession } from "@/lib/session";
import { OwnerPicker, RepoList } from "./repo-list";

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
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="font-semibold">eve</span>
          <nav className="flex gap-4 text-sm text-neutral-400">
            <span className="text-white">Repositories</span>
            <a href={config.chatUrl()} className="hover:text-white">Chat</a>
          </nav>
        </div>
        <form action="/api/auth/logout" method="post" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={session.avatar} alt="" className="h-7 w-7 rounded-full" />
          <span className="hidden text-sm text-neutral-300 sm:inline">{session.login}</span>
          <button className="text-sm text-neutral-500 hover:text-white">Sign out</button>
        </form>
      </header>

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
            <RepoList repos={repos} chatUrl={config.chatUrl()} configureUrl={installUrl} />
          </>
        )}
      </main>
    </div>
  );
}

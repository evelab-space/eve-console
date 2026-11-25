// A user may act on a project if their GitHub token can see its repository through an installation of
// the eve GitHub App (the same rule as the repository list).
import { listOwners, listRepos } from "./github";
import type { Session } from "./session";

export async function canAccessRepo(session: Session, fullName: string): Promise<boolean> {
  const owner = fullName.split("/")[0].toLowerCase();
  const inst = (await listOwners(session.token)).find((o) => o.login.toLowerCase() === owner);
  if (!inst) return false;
  return (await listRepos(session.token, inst.installationId)).some((r) => r.fullName.toLowerCase() === fullName.toLowerCase());
}

export async function defaultBranchHead(token: string, fullName: string): Promise<{ sha: string; message: string }> {
  const h = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "eve-console" };
  const repo = await fetch(`https://api.github.com/repos/${fullName}`, { headers: h, cache: "no-store" }).then((r) => r.json());
  const commit = await fetch(`https://api.github.com/repos/${fullName}/commits/${repo.default_branch}`, { headers: h, cache: "no-store" }).then((r) =>
    r.json(),
  );
  if (!commit.sha) throw new Error(`no commit on ${fullName}@${repo.default_branch}`);
  return { sha: commit.sha as string, message: (commit.commit?.message as string) ?? "" };
}

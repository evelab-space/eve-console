// GitHub REST calls made with the signed-in user's token. Results are limited to accounts and orgs
// where the eve GitHub App is installed AND repositories the user can access (same model as Vercel).
const API = "https://api.github.com";

export class GitHubAuthError extends Error {}

async function gh<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "eve-console",
    },
    cache: "no-store",
  });
  if (res.status === 401) throw new GitHubAuthError("GitHub token expired or revoked");
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export type Owner = { installationId: number; login: string; avatar: string; type: "User" | "Organization" };
export type Repo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  language: string | null;
  pushedAt: string;
  url: string;
  description: string | null;
};

export async function getUser(token: string) {
  const u = await gh<{ login: string; avatar_url: string }>(token, "/user");
  return { login: u.login, avatar: u.avatar_url };
}

export async function listOwners(token: string): Promise<Owner[]> {
  const r = await gh<{ installations: { id: number; account: { login: string; avatar_url: string; type: string } }[] }>(
    token,
    "/user/installations?per_page=100",
  );
  return r.installations
    .map((i) => ({
      installationId: i.id,
      login: i.account.login,
      avatar: i.account.avatar_url,
      type: i.account.type === "Organization" ? ("Organization" as const) : ("User" as const),
    }))
    .sort((a, b) => (a.type === b.type ? a.login.localeCompare(b.login) : a.type === "User" ? -1 : 1));
}

export async function listRepos(token: string, installationId: number): Promise<Repo[]> {
  const repos: Repo[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await gh<{ repositories: any[]; total_count: number }>(
      token,
      `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
    );
    for (const x of r.repositories) {
      repos.push({
        id: x.id,
        name: x.name,
        fullName: x.full_name,
        private: x.private,
        language: x.language,
        pushedAt: x.pushed_at,
        url: x.html_url,
        description: x.description,
      });
    }
    if (repos.length >= r.total_count || r.repositories.length < 100) break;
  }
  return repos.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

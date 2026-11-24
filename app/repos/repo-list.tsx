"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Owner, Repo } from "@/lib/github";

export function OwnerPicker({ owners, selected, installUrl }: { owners: Owner[]; selected: string; installUrl: string }) {
  const router = useRouter();
  return (
    <select
      value={selected}
      onChange={(e) => {
        if (e.target.value === "__add") window.location.href = installUrl;
        else router.push(`/repos?owner=${encodeURIComponent(e.target.value)}`);
      }}
      className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm sm:w-64"
      aria-label="GitHub account or organisation"
    >
      {owners.map((o) => (
        <option key={o.installationId} value={o.login}>
          {o.login}
          {o.type === "Organization" ? " (team)" : ""}
        </option>
      ))}
      <option value="__add">+ Add GitHub account or organisation</option>
    </select>
  );
}

export function RepoList({ repos, chatUrl, configureUrl }: { repos: Repo[]; chatUrl: string; configureUrl: string }) {
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => repos.filter((r) => r.fullName.toLowerCase().includes(q.trim().toLowerCase())),
    [repos, q],
  );

  return (
    <div className="mt-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-600"
      />
      <ul className="mt-4 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
        {shown.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <a href={r.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
                  {r.name}
                </a>
                {r.private && <span className="rounded border border-neutral-700 px-1.5 text-xs text-neutral-400">private</span>}
              </div>
              <p className="truncate text-sm text-neutral-500">
                {[r.language, ago(r.pushedAt)].filter(Boolean).join(" · ")}
                {r.description ? ` · ${r.description}` : ""}
              </p>
            </div>
            <a
              href={`${chatUrl}/c/new?prompt=${encodeURIComponent(`Let's work on the GitHub repository ${r.fullName}.`)}`}
              className="shrink-0 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200"
            >
              Chat
            </a>
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-neutral-500">No repositories found.</li>}
      </ul>
      <p className="mt-4 text-sm text-neutral-500">
        Missing a repository?{" "}
        <a href={configureUrl} className="text-neutral-300 hover:underline">
          Adjust GitHub App permissions →
        </a>
      </p>
    </div>
  );
}

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

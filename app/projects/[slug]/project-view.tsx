"use client";

import { useEffect, useState } from "react";

type Build = { name: string; sha: string; state: "running" | "succeeded" | "failed"; started: string };
type Data = {
  project: { slug: string; repo: string; image: string; sha: string };
  url: string;
  builds: Build[];
  deploy: { sync: string; health: string } | null;
  logs?: string;
};

const dot: Record<string, string> = {
  running: "bg-yellow-400",
  succeeded: "bg-green-500",
  failed: "bg-red-500",
  Healthy: "bg-green-500",
  Progressing: "bg-yellow-400",
  Degraded: "bg-red-500",
};

export function ProjectView({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<string>("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const r = await fetch(`/api/projects?slug=${slug}${open ? `&build=${open}` : ""}`);
      const j = await r.json();
      if (stop) return;
      if (!r.ok) setError(j.error ?? "failed to load");
      else setData(j);
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [slug, open]);

  async function deploy() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/projects", { method: "POST", body: JSON.stringify({ slug, action: "deploy" }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error ?? "deploy failed");
    setOpen(j.build);
  }

  if (!data) return <main className="mx-auto max-w-4xl px-4 py-10 text-neutral-500">{error || "Loading…"}</main>;
  const live = data.deploy?.health === "Healthy" && data.project.image;
  const latest = data.builds[0];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.project.repo.split("/")[1]}</h1>
          <p className="text-sm text-neutral-500">{data.project.repo}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/chat?repo=${encodeURIComponent(data.project.repo)}`} className="rounded-md border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900">
            Chat
          </a>
          <button onClick={deploy} disabled={busy || latest?.state === "running"} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40">
            {latest?.state === "running" ? "Building…" : "Deploy"}
          </button>
        </div>
      </div>

      <section className="mt-8 rounded-lg border border-neutral-800">
        <div className="border-b border-neutral-800 px-4 py-3 text-sm font-medium">Production</div>
        <div className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-neutral-500">Status</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${dot[data.deploy?.health ?? ""] ?? "bg-neutral-600"}`} />
              {data.project.image ? data.deploy?.health ?? "Pending" : "Not deployed yet"}
            </div>
          </div>
          <div>
            <div className="text-neutral-500">Domain</div>
            {live ? (
              <a href={data.url} target="_blank" rel="noreferrer" className="mt-1 block truncate hover:underline">{new URL(data.url).host}</a>
            ) : (
              <div className="mt-1 truncate text-neutral-600">{new URL(data.url).host}</div>
            )}
          </div>
          <div>
            <div className="text-neutral-500">Commit</div>
            <div className="mt-1 font-mono">{data.project.sha ? data.project.sha.slice(0, 7) : "—"}</div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Builds</h2>
        <ul className="mt-3 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
          {data.builds.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-500">No builds yet. Press Deploy.</li>}
          {data.builds.map((b) => (
            <li key={b.name}>
              <button onClick={() => setOpen(open === b.name ? "" : b.name)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-neutral-950">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot[b.state]}`} />
                  <span className="font-mono">{b.sha.slice(0, 7)}</span>
                  <span className="text-neutral-500">{b.state}</span>
                </span>
                <span className="text-neutral-500">{new Date(b.started).toLocaleString()}</span>
              </button>
              {open === b.name && (
                <pre className="max-h-96 overflow-auto border-t border-neutral-800 bg-neutral-950 px-4 py-3 font-mono text-xs text-neutral-400">
                  {data.logs || "Waiting for logs…"}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </section>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </main>
  );
}

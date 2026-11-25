"use client";

import { useEffect, useState } from "react";
import { Chat } from "../../chat/chat";

type Build = { name: string; sha: string; state: "running" | "succeeded" | "failed"; started: string };
type Stage = { key: string; label: string; state: "pending" | "running" | "done" | "failed"; seconds?: number };
type Detail = { build: string; sha: string; state: "building" | "deploying" | "live" | "failed"; total?: number; stages: Stage[]; logs: string };
type Data = {
  project: { slug: string; repo: string; image: string; sha: string };
  url: string;
  builds: Build[];
  deploy: { sync: string; health: string } | null;
  detail: Detail | null;
};

const stageIcon = { pending: "○", running: "◐", done: "●", failed: "✕" };
const stageColor = { pending: "text-neutral-600", running: "text-yellow-400 animate-pulse", done: "text-green-500", failed: "text-red-500" };
const dot: Record<string, string> = { running: "bg-yellow-400", succeeded: "bg-green-500", failed: "bg-red-500" };
const fmt = (s?: number) => (s === undefined ? "" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

export function ProjectView({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<string>("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"overview" | "chat">("overview");
  const [fixPrompt, setFixPrompt] = useState<string>("");

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
    const t = setInterval(load, 2500);
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

  function fixWithEve(d: Detail) {
    const tail = d.logs.split("\n").slice(-60).join("\n");
    setFixPrompt(
      `The eve build of commit ${d.sha.slice(0, 7)} failed. Find the cause in the log below, fix it in the repository, ` +
        `run the build or tests if you can, then push a branch and tell me what you changed.\n\n\`\`\`\n${tail}\n\`\`\``,
    );
    setTab("chat");
  }

  if (!data) return <main className="mx-auto max-w-5xl px-4 py-10 text-neutral-500">{error || <Skeleton />}</main>;
  const d = data.detail;
  const live = data.deploy?.health === "Healthy" && !!data.project.image;
  const building = data.builds[0]?.state === "running";
  const name = data.project.repo.split("/")[1];

  const overview = (
    <div className="min-w-0">
      {/* Production card */}
      <section className="rounded-lg border border-neutral-800">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <span className="text-sm font-medium">Production</span>
          {live && (
            <a href={data.url} target="_blank" rel="noreferrer" className="rounded-md border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-900">Visit ↗</a>
          )}
        </div>
        <div className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-3">
          <Field label="Status">
            <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : data.project.image ? "bg-yellow-400" : "bg-neutral-600"}`} />
            {data.project.image ? data.deploy?.health ?? "Pending" : "Not deployed yet"}
          </Field>
          <Field label="Domain">
            {live ? (
              <a href={data.url} target="_blank" rel="noreferrer" className="truncate hover:underline">{new URL(data.url).host}</a>
            ) : (
              <span className="truncate text-neutral-600">{new URL(data.url).host}</span>
            )}
          </Field>
          <Field label="Commit">
            <span className="font-mono">{data.project.sha ? data.project.sha.slice(0, 7) : "—"}</span>
          </Field>
        </div>
      </section>

      {/* Timeline of the selected (or newest) build */}
      {d && (
        <section className="mt-6 rounded-lg border border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3 text-sm">
            <span className="font-medium">
              Deployment <span className="font-mono text-neutral-400">{d.sha.slice(0, 7)}</span>
            </span>
            <span className={d.state === "failed" ? "text-red-400" : d.state === "live" ? "text-green-400" : "text-yellow-400"}>
              {d.state === "live" ? `Ready${d.total ? ` in ${fmt(d.total)}` : ""}` : d.state === "failed" ? "Failed" : d.state === "deploying" ? "Deploying…" : "Building…"}
            </span>
          </div>
          <ol className="grid grid-cols-3 gap-y-3 px-4 py-4 sm:grid-cols-6">
            {d.stages.map((s) => (
              <li key={s.key} className="flex flex-col items-center text-center text-xs">
                <span className={`text-lg leading-none ${stageColor[s.state]}`}>{stageIcon[s.state]}</span>
                <span className="mt-1 text-neutral-300">{s.label}</span>
                <span className="text-neutral-500">{fmt(s.seconds)}</span>
              </li>
            ))}
          </ol>
          {d.state === "failed" && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 bg-red-950/30 px-4 py-3 text-sm">
              <span className="text-red-300">The build failed. eve can read the log and fix it for you.</span>
              <button onClick={() => fixWithEve(d)} className="rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200">Fix with eve</button>
            </div>
          )}
          <details className="border-t border-neutral-800" open={d.state === "failed" || d.state === "building"}>
            <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-400">Build log</summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all bg-neutral-950 px-4 py-3 font-mono text-xs leading-relaxed text-neutral-400">
              {d.logs || "Waiting for logs…"}
            </pre>
          </details>
        </section>
      )}

      {/* History */}
      <section className="mt-6">
        <h2 className="text-sm font-medium">Deployments</h2>
        <ul className="mt-3 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
          {data.builds.length === 0 && <li className="px-4 py-8 text-center text-sm text-neutral-500">No deployments yet. Press Deploy to build and ship the latest commit.</li>}
          {data.builds.map((b) => (
            <li key={b.name}>
              <button
                onClick={() => setOpen(b.name)}
                className={`flex min-h-12 w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-neutral-950 ${d?.build === b.name ? "bg-neutral-950" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot[b.state]}`} />
                  <span className="font-mono">{b.sha.slice(0, 7)}</span>
                  <span className="text-neutral-500">{b.state}</span>
                </span>
                <span className="text-neutral-500">{new Date(b.started).toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <a href={`https://github.com/${data.project.repo}`} target="_blank" rel="noreferrer" className="text-sm text-neutral-500 hover:text-neutral-300">{data.project.repo}</a>
        </div>
        <button
          onClick={deploy}
          disabled={busy || building}
          className="min-h-11 rounded-md bg-white px-5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40"
        >
          {building ? "Building…" : "Deploy"}
        </button>
      </div>

      {/* Phones: tabs. Desktop: overview + chat side by side. */}
      <div className="mt-6 flex border-b border-neutral-800 lg:hidden">
        {(["overview", "chat"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`min-h-11 flex-1 text-sm capitalize ${tab === t ? "border-b-2 border-white text-white" : "text-neutral-500"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className={tab === "overview" ? "" : "hidden lg:block"}>{overview}</div>
        <aside className={`${tab === "chat" ? "" : "hidden lg:flex"} flex h-[70vh] flex-col overflow-hidden rounded-lg border border-neutral-800 lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]`}>
          <Chat repo={data.project.repo} prompt={fixPrompt} onPromptSent={() => setFixPrompt("")} />
        </aside>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-neutral-500">{label}</div>
      <div className="mt-1 flex items-center gap-2">{children}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-neutral-900" />
      <div className="h-32 rounded-lg bg-neutral-900" />
      <div className="h-48 rounded-lg bg-neutral-900" />
    </div>
  );
}

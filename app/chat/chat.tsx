"use client";

import { useEffect, useRef, useState } from "react";

type Part = { role: string; type: string; text?: string; tool?: string; status?: string };

export function Chat({ repo }: { repo: string }) {
  const [state, setState] = useState<"off" | "starting" | "ready">("off");
  const [session, setSession] = useState<string>("");
  const [parts, setParts] = useState<Part[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const q = `repo=${encodeURIComponent(repo)}`;

  // Poll the sandbox: readiness while starting, messages once a session exists.
  useEffect(() => {
    if (state === "off") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/sandbox?${q}${session ? `&session=${session}` : ""}`).then((x) => x.json());
      if (!r.running) return setState("off");
      if (r.ready) setState("ready");
      if (r.messages?.length) setParts(r.messages);
    }, 2000);
    return () => clearInterval(t);
  }, [state, session, q]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [parts]);

  async function start() {
    setError("");
    setState("starting");
    const r = await fetch("/api/sandbox", { method: "POST", body: JSON.stringify({ repo }) });
    if (!r.ok) setError((await r.json()).error ?? "could not start");
  }

  async function send() {
    if (!text.trim() || state !== "ready") return;
    setError("");
    const r = await fetch("/api/sandbox", { method: "POST", body: JSON.stringify({ repo, session, text }) });
    const j = await r.json();
    if (!r.ok) return setError(j.error ?? "failed");
    setSession(j.session);
    setParts((p) => [...p, { role: "user", type: "text", text }]);
    setText("");
  }

  async function stop() {
    await fetch(`/api/sandbox?${q}`, { method: "DELETE" });
    setState("off");
    setSession("");
    setParts([]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-2 text-sm sm:px-6">
        <span className="text-neutral-400">
          Sandbox:{" "}
          <span className={state === "ready" ? "text-green-400" : state === "starting" ? "text-yellow-400" : "text-neutral-500"}>
            {state === "ready" ? "running" : state === "starting" ? "starting…" : "off"}
          </span>
          <span className="hidden text-neutral-600 sm:inline"> · runs code in an isolated container, stops after 2h</span>
        </span>
        {state === "off" ? (
          <button onClick={start} className="rounded-md bg-white px-3 py-1 font-medium text-black hover:bg-neutral-200">Start sandbox</button>
        ) : (
          <button onClick={stop} className="text-neutral-400 hover:text-white">Stop</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {parts.length === 0 && (
            <p className="mt-20 text-center text-2xl font-semibold tracking-tight text-neutral-300">What do you want to build?</p>
          )}
          {parts.map((p, i) =>
            p.type === "tool" ? (
              <div key={i} className="rounded-md border border-neutral-800 px-3 py-2 font-mono text-xs text-neutral-400">
                {p.status === "completed" ? "✓" : p.status === "error" ? "✗" : "…"} {p.tool} {p.text ? `· ${p.text}` : ""}
              </div>
            ) : (
              <div key={i} className={p.role === "user" ? "self-end rounded-lg bg-neutral-800 px-4 py-2" : "whitespace-pre-wrap leading-relaxed"}>
                {p.text}
              </div>
            ),
          )}
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-neutral-900 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={state === "ready" ? "Ask eve to change something…" : "Start the sandbox to begin"}
            disabled={state !== "ready"}
            className="flex-1 resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-600 disabled:opacity-50"
          />
          <button onClick={send} disabled={state !== "ready"} className="rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-40">
            Send
          </button>
        </div>
        {error && <p className="mx-auto mt-2 max-w-3xl text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}

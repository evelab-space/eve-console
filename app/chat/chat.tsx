"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Part = { role: string; type: string; text?: string; tool?: string; status?: string };

// Chat with the repo's sandbox (OpenCode). `prompt` (e.g. from "Fix with eve") starts the sandbox if
// needed and is sent as soon as it is ready.
export function Chat({ repo, prompt, onPromptSent }: { repo: string; prompt?: string; onPromptSent?: () => void }) {
  const [state, setState] = useState<"off" | "starting" | "ready">("off");
  const [session, setSession] = useState<string>("");
  const [parts, setParts] = useState<Part[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [queued, setQueued] = useState<string>("");
  const list = useRef<HTMLDivElement>(null);
  const q = `repo=${encodeURIComponent(repo)}`;

  // Pick up a running sandbox on load.
  useEffect(() => {
    fetch(`/api/sandbox?${q}`)
      .then((r) => r.json())
      .then((r) => r.running && setState(r.ready ? "ready" : "starting"))
      .catch(() => {});
  }, [q]);

  // Poll: readiness while starting, messages once a session exists.
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

  // Scroll only the message list (scrollIntoView would also scroll the page under the chat panel).
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [parts]);

  // External prompt: queue it, start the sandbox.
  useEffect(() => {
    if (!prompt) return;
    setQueued(prompt);
    onPromptSent?.();
    if (state === "off") start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  useEffect(() => {
    if (queued && state === "ready") {
      const t = queued;
      setQueued("");
      send(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, state]);

  async function start() {
    setError("");
    setState("starting");
    const r = await fetch("/api/sandbox", { method: "POST", body: JSON.stringify({ repo }) });
    if (!r.ok) {
      setError((await r.json()).error ?? "could not start");
      setState("off");
    }
  }

  async function send(message = text) {
    if (!message.trim() || state !== "ready") return;
    setError("");
    setParts((p) => [...p, { role: "user", type: "text", text: message }]);
    if (message === text) setText("");
    const r = await fetch("/api/sandbox", { method: "POST", body: JSON.stringify({ repo, session, text: message }) });
    const j = await r.json();
    if (!r.ok) return setError(j.error ?? "failed");
    setSession(j.session);
  }

  async function stop() {
    await fetch(`/api/sandbox?${q}`, { method: "DELETE" });
    setState("off");
    setSession("");
    setParts([]);
  }

  const suggestions = ["Explain this repository", "Add a /health endpoint", "Why might the build fail?"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-sm">
        <span className="text-neutral-400">
          eve ·{" "}
          <span className={state === "ready" ? "text-green-400" : state === "starting" ? "text-yellow-400" : "text-neutral-500"}>
            {state === "ready" ? "sandbox running" : state === "starting" ? (queued ? "starting sandbox, then fixing…" : "starting sandbox…") : "sandbox off"}
          </span>
        </span>
        {state === "off" ? (
          <button onClick={start} className="min-h-9 rounded-md bg-white px-3 font-medium text-black hover:bg-neutral-200">Start</button>
        ) : (
          <button onClick={stop} className="min-h-9 px-2 text-neutral-400 hover:text-white">Stop</button>
        )}
      </div>

      <div ref={list} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          {parts.length === 0 && (
            <div className="mt-10 text-center">
              <p className="text-lg font-semibold text-neutral-200">What do you want to build?</p>
              <p className="mt-1 text-sm text-neutral-500">eve works in an isolated copy of your repo and pushes a branch.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => (state === "ready" ? send(s) : (setQueued(s), state === "off" && start()))} className="min-h-9 rounded-full border border-neutral-700 px-3 text-sm text-neutral-300 hover:bg-neutral-900">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {parts.map((p, i) =>
            p.type === "tool" ? (
              <div key={i} className="rounded-md border border-neutral-800 px-3 py-2 font-mono text-xs break-all text-neutral-400">
                {p.status === "completed" ? "✓" : p.status === "error" ? "✕" : "…"} {p.tool} {p.text ? `· ${p.text}` : ""}
              </div>
            ) : (
              <div key={i} className={p.role === "user" ? "max-w-[85%] self-end rounded-lg bg-neutral-800 px-3 py-2 text-sm whitespace-pre-wrap break-words" : "text-sm leading-relaxed whitespace-pre-wrap break-words"}>
                {p.role === "user" ? (p.text && p.text.length > 400 ? p.text.slice(0, 400) + "…" : p.text) : <Md text={p.text ?? ""} />}
              </div>
            ),
          )}
        </div>
      </div>

      <div className="border-t border-neutral-800 p-3">
        <div className="flex gap-2">
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
            placeholder={state === "ready" ? "Ask eve to change something…" : "Start the sandbox to chat"}
            disabled={state !== "ready"}
            className="flex-1 resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base placeholder:text-neutral-600 disabled:opacity-50 sm:text-sm"
          />
          <button onClick={() => send()} disabled={state !== "ready"} className="min-w-16 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-40">
            Send
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}

// Assistant replies: GitHub-flavoured markdown, styled for the dark UI. No raw HTML.
function Md({ text }: { text: string }) {
  return (
    <div className="space-y-2 whitespace-normal [&_a]:text-blue-400 [&_a]:underline [&_code]:rounded [&_code]:bg-neutral-800 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-neutral-950 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc">
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}

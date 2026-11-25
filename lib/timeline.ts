// Build → deploy timeline for one build: Source · Detect · Build · Export · Deploy · Live, each with a
// state and duration. Source comes from the init container status; Detect/Build/Export from the
// buildpacks lifecycle's "===> PHASE" markers (log lines with timestamps); Deploy/Live from Argo CD.
import { readFileSync } from "node:fs";
import { k8s } from "./k8s";
import type { Project } from "./projects";

const BUILDS = "eve-builds";

export type StageState = "pending" | "running" | "done" | "failed";
export type Stage = { key: string; label: string; state: StageState; seconds?: number };

const PHASES: [string, string][] = [
  ["DETECTING", "detect"],
  ["BUILDING", "build"],
  ["EXPORTING", "export"],
];

async function podLog(pod: string, container: string, timestamps: boolean): Promise<string> {
  const token = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8");
  const base = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`;
  const res = await fetch(`${base}/api/v1/namespaces/${BUILDS}/pods/${pod}/log?container=${container}&tailLines=2000${timestamps ? "&timestamps=true" : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return res.ok ? res.text() : "";
}

const secs = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000)) : undefined);

export async function buildDetail(p: Project, build: string, deploy: { sync: string; health: string } | null) {
  const job = await k8s("GET", `/apis/batch/v1/namespaces/${BUILDS}/jobs/${build}`);
  const sha: string = job.metadata.annotations?.["eve.io/sha"] ?? "";
  const failed = !!job.status?.failed;
  const succeeded = !!job.status?.succeeded;
  const pods = await k8s("GET", `/api/v1/namespaces/${BUILDS}/pods?labelSelector=eve.io%2Fbuild%3D${build}`);
  const pod = pods.items[0];

  const stages: Stage[] = [
    { key: "source", label: "Source", state: "pending" },
    { key: "detect", label: "Detect", state: "pending" },
    { key: "build", label: "Build", state: "pending" },
    { key: "export", label: "Push", state: "pending" },
    { key: "deploy", label: "Deploy", state: "pending" },
    { key: "live", label: "Live", state: "pending" },
  ];
  const at = (k: string) => stages.find((s) => s.key === k)!;
  let logs = "";

  if (pod) {
    const init = pod.status?.initContainerStatuses?.[0]?.state ?? {};
    if (init.running) at("source").state = "running";
    if (init.terminated) {
      at("source").state = init.terminated.exitCode === 0 ? "done" : "failed";
      at("source").seconds = secs(init.terminated.startedAt, init.terminated.finishedAt);
    }
    const [srcLog, buildLog] = await Promise.all([podLog(pod.metadata.name, "source", false), podLog(pod.metadata.name, "build", true)]);
    const lines = buildLog.split("\n").filter(Boolean);
    // "<RFC3339 ts> ===> BUILDING"
    const marks: { key: string; ts: string }[] = [];
    for (const l of lines) {
      const sp = l.indexOf(" ");
      const ts = l.slice(0, sp);
      for (const [word, key] of PHASES) if (l.includes(`===> ${word}`)) marks.push({ key, ts });
    }
    const end = pod.status?.containerStatuses?.[0]?.state?.terminated?.finishedAt;
    marks.forEach((m, i) => {
      const s = at(m.key);
      const next = marks[i + 1]?.ts ?? end;
      s.seconds = secs(m.ts, next);
      s.state = marks[i + 1] || succeeded ? "done" : failed ? "failed" : "running";
    });
    if (at("source").state === "failed") {
      /* nothing after it ran */
    } else if (failed && marks.length === 0) at("detect").state = "failed";
    logs = [srcLog.trim(), lines.map((l) => l.slice(l.indexOf(" ") + 1)).join("\n")].filter(Boolean).join("\n");
  }

  const isCurrent = succeeded && p.sha === sha;
  if (isCurrent) {
    at("deploy").state = deploy?.sync === "Synced" ? "done" : "running";
    at("live").state = deploy?.health === "Healthy" ? "done" : deploy?.health === "Degraded" ? "failed" : deploy ? "running" : "pending";
  }
  const state = failed ? "failed" : succeeded ? (isCurrent && deploy?.health === "Healthy" ? "live" : "deploying") : "building";
  const total = secs(job.metadata.creationTimestamp, job.status?.completionTime ?? pod?.status?.containerStatuses?.[0]?.state?.terminated?.finishedAt);
  return { build, sha, state, total, stages, logs };
}

// Minimal in-cluster Kubernetes client (ServiceAccount token). The console only manages sandbox pods,
// secrets and services in the sandbox namespace; its Role allows nothing else.
import { readFileSync } from "node:fs";

const SA = "/var/run/secrets/kubernetes.io/serviceaccount";
const API = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`;

export class NotFound extends Error {}

export async function k8s<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const token = readFileSync(`${SA}/token`, "utf8");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": method === "PATCH" ? "application/apply-patch+yaml" : "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 404) throw new NotFound(path);
  if (!res.ok) throw new Error(`k8s ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Server-side apply: idempotent create-or-update owned by the console.
export function apply(path: string, obj: unknown) {
  return k8s("PATCH", `${path}?fieldManager=eve-console&force=true`, obj);
}

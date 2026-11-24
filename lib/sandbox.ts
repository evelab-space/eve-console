// Optional sandbox: one OpenCode server per user + repository, in its own pod in the sandbox namespace.
// The pod clones the repo with the user's GitHub token, runs code, and can push branches as the user.
// It reaches only GitHub, npm and the model API (CiliumNetworkPolicy), and dies after SANDBOX_TTL seconds.
import { createHash, randomBytes } from "node:crypto";
import { apply, k8s, NotFound } from "./k8s";

const NS = process.env.SANDBOX_NAMESPACE ?? "eve-sandboxes";
const IMAGE = process.env.SANDBOX_IMAGE ?? "ghcr.io/anomalyco/opencode:1.19.6";
const TTL = Number(process.env.SANDBOX_TTL ?? 7200);
const MODEL = process.env.SANDBOX_MODEL ?? "anthropic/claude-sonnet-4-5";

export type Sandbox = { name: string; ready: boolean; url: string; password: string };

export function sandboxName(login: string, repo: string): string {
  return "sb-" + createHash("sha256").update(`${login}/${repo}`).digest("hex").slice(0, 16);
}

export async function getSandbox(name: string): Promise<Sandbox | null> {
  try {
    const [pod, secret] = await Promise.all([
      k8s(`GET`, `/api/v1/namespaces/${NS}/pods/${name}`),
      k8s(`GET`, `/api/v1/namespaces/${NS}/secrets/${name}`),
    ]);
    const ready = (pod.status?.conditions ?? []).some((c: any) => c.type === "Ready" && c.status === "True");
    const password = Buffer.from(secret.data.OPENCODE_SERVER_PASSWORD, "base64").toString();
    return { name, ready, url: `http://${name}.${NS}.svc.cluster.local:4096`, password };
  } catch (e) {
    if (e instanceof NotFound) return null;
    throw e;
  }
}

export async function ensureSandbox(login: string, repo: string, githubToken: string): Promise<Sandbox> {
  const name = sandboxName(login, repo);
  const existing = await getSandbox(name);
  if (existing) return existing;

  const labels = { "app.kubernetes.io/name": "eve-sandbox", "eve.io/sandbox": name };
  const password = randomBytes(24).toString("hex");
  const config = {
    $schema: "https://opencode.ai/config.json",
    model: MODEL,
    share: "disabled",
    autoupdate: false,
    disabled_providers: ["opencode"],
  };

  await apply(`/api/v1/namespaces/${NS}/secrets/${name}`, {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name, namespace: NS, labels },
    stringData: { OPENCODE_SERVER_PASSWORD: password, GITHUB_TOKEN: githubToken },
  });
  await apply(`/api/v1/namespaces/${NS}/services/${name}`, {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name, namespace: NS, labels },
    spec: { selector: { "eve.io/sandbox": name }, ports: [{ name: "http", port: 4096, targetPort: 4096 }] },
  });
  await apply(`/api/v1/namespaces/${NS}/pods/${name}`, {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name, namespace: NS, labels, annotations: { "eve.io/user": login, "eve.io/repo": repo } },
    spec: {
      activeDeadlineSeconds: TTL,
      restartPolicy: "Never",
      automountServiceAccountToken: false,
      securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: "RuntimeDefault" } },
      initContainers: [
        {
          name: "clone",
          image: "alpine/git:2.47.2",
          command: ["sh", "-c"],
          args: [
            `set -e; cd /workspace; git clone --depth 50 "https://x-access-token:$GITHUB_TOKEN@github.com/${repo}.git" repo; ` +
              `cd repo; git config user.name "${login}"; git config user.email "${login}@users.noreply.github.com"`,
          ],
          env: [{ name: "GITHUB_TOKEN", valueFrom: { secretKeyRef: { name, key: "GITHUB_TOKEN" } } }, { name: "HOME", value: "/tmp" }],
          resources: { requests: { cpu: "50m", memory: "64Mi" }, limits: { memory: "256Mi" } }, // namespace quotas require limits
          volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
        },
      ],
      containers: [
        {
          name: "opencode",
          image: IMAGE,
          args: ["serve", "--hostname", "0.0.0.0", "--port", "4096"],
          workingDir: "/workspace/repo",
          env: [
            { name: "HOME", value: "/home/opencode" },
            { name: "OPENCODE_CONFIG_CONTENT", value: JSON.stringify(config) },
            { name: "OPENCODE_DISABLE_PROJECT_CONFIG", value: "true" }, // a repo's opencode.json can't add tools or servers
            { name: "OPENCODE_DISABLE_AUTOUPDATE", value: "true" },
            { name: "OPENCODE_DISABLE_MODELS_FETCH", value: "true" },
            { name: "OPENCODE_SERVER_PASSWORD", valueFrom: { secretKeyRef: { name, key: "OPENCODE_SERVER_PASSWORD" } } },
            { name: "GITHUB_TOKEN", valueFrom: { secretKeyRef: { name, key: "GITHUB_TOKEN" } } },
            { name: "ANTHROPIC_API_KEY", valueFrom: { secretKeyRef: { name: "sandbox-model", key: "anthropic_api_key", optional: true } } },
          ],
          ports: [{ name: "http", containerPort: 4096 }],
          readinessProbe: { tcpSocket: { port: 4096 }, periodSeconds: 3 },
          resources: { requests: { cpu: "250m", memory: "512Mi" }, limits: { cpu: "2", memory: "2Gi" } },
          volumeMounts: [
            { name: "workspace", mountPath: "/workspace" },
            { name: "home", mountPath: "/home/opencode" },
          ],
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
        },
      ],
      volumes: [
        { name: "workspace", emptyDir: { sizeLimit: "5Gi" } },
        { name: "home", emptyDir: { sizeLimit: "1Gi" } },
      ],
    },
  });
  return { name, ready: false, url: `http://${name}.${NS}.svc.cluster.local:4096`, password };
}

export async function deleteSandbox(name: string) {
  for (const kind of ["pods", "services", "secrets"]) {
    await k8s("DELETE", `/api/v1/namespaces/${NS}/${kind}/${name}`).catch((e) => {
      if (!(e instanceof NotFound)) throw e;
    });
  }
}

// OpenCode server calls (legacy session API: in 1.19.x it is the one that actually runs the agent).
async function oc<T>(sb: Sandbox, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${sb.url}${path}`, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(`opencode:${sb.password}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`opencode ${method} ${path}: ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function createSession(sb: Sandbox, title: string): Promise<string> {
  const s = await oc<{ id: string }>(sb, "POST", "/session", { title });
  return s.id;
}

export function prompt(sb: Sandbox, sessionId: string, text: string) {
  return oc(sb, "POST", `/session/${sessionId}/prompt_async`, { parts: [{ type: "text", text }] });
}

export type ChatPart = { role: string; type: string; text?: string; tool?: string; status?: string };

export async function messages(sb: Sandbox, sessionId: string): Promise<ChatPart[]> {
  const list = await oc<{ info: { role: string }; parts: any[] }[]>(sb, "GET", `/session/${sessionId}/message`);
  return list.flatMap((m) =>
    m.parts
      .filter((p) => p.type === "text" || p.type === "tool")
      .map((p) => ({
        role: m.info.role,
        type: p.type,
        text: p.type === "text" ? p.text : String(p.state?.title ?? p.state?.output ?? "").slice(0, 2000),
        tool: p.tool,
        status: p.state?.status,
      })),
  );
}

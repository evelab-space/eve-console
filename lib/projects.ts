// Projects and builds. A project is a ConfigMap in eve-projects (no database). Deploy = a build Job in
// eve-builds (Cloud Native Buildpacks, no Dockerfile needed) that pushes to the eve registry; once it
// succeeds the project's image is updated and Argo CD (plugin generator → /api/argocd) deploys it.
import { createHash } from "node:crypto";
import { apply, k8s, NotFound } from "./k8s";

const PROJECTS = "eve-projects";
const BUILDS = "eve-builds";
const REGISTRY_PUSH = "registry.eve-registry.svc.cluster.local:5000"; // build Jobs push here
const REGISTRY_PULL = "localhost:5000"; // nodes pull the same images from here
const BUILDER = process.env.BUILDER_IMAGE ?? "docker.io/heroku/builder:24";
export const BASE_DOMAIN = process.env.APPS_DOMAIN ?? "evelab.space";

export type Project = {
  slug: string;
  owner: string;
  repo: string; // owner/name
  image: string; // empty until the first successful build
  sha: string;
  importedBy: string;
  pinned?: boolean;
};

const dns = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

export function slugFor(fullName: string): string {
  const [owner, name] = fullName.split("/");
  const s = dns(`${name}-${owner}`);
  return s.length <= 40 ? s : `${s.slice(0, 31)}-${createHash("sha256").update(fullName).digest("hex").slice(0, 8)}`;
}

export const tenantNamespace = (owner: string) => `t-${dns(owner)}`.slice(0, 63);
export const projectUrl = (slug: string) => `https://${slug}.${BASE_DOMAIN}`;

function fromConfigMap(cm: any): Project {
  const d = cm.data ?? {};
  return { slug: cm.metadata.name, owner: d.owner, repo: d.repo, image: d.image ?? "", sha: d.sha ?? "", importedBy: d.importedBy ?? "", pinned: d.pinned === "true" };
}

export async function listProjects(): Promise<Project[]> {
  const r = await k8s("GET", `/api/v1/namespaces/${PROJECTS}/configmaps?labelSelector=eve.io%2Fproject`);
  return r.items.map(fromConfigMap);
}

export async function getProject(slug: string): Promise<Project | null> {
  try {
    return fromConfigMap(await k8s("GET", `/api/v1/namespaces/${PROJECTS}/configmaps/${slug}`));
  } catch (e) {
    if (e instanceof NotFound) return null;
    throw e;
  }
}

export async function importProject(fullName: string, login: string): Promise<Project> {
  const slug = slugFor(fullName);
  const existing = await getProject(slug);
  if (existing) return existing;
  const owner = fullName.split("/")[0];
  await apply(`/api/v1/namespaces/${PROJECTS}/configmaps/${slug}`, {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: slug, namespace: PROJECTS, labels: { "eve.io/project": slug, "eve.io/owner": dns(owner) } },
    data: { owner, repo: fullName, importedBy: login, image: "", sha: "" },
  });
  return { slug, owner, repo: fullName, image: "", sha: "", importedBy: login };
}

const buildName = (slug: string, sha: string) => `b-${slug.slice(0, 40)}-${sha.slice(0, 7)}`;

export async function startBuild(p: Project, sha: string, githubToken: string, message = ""): Promise<string> {
  const name = buildName(p.slug, sha);
  const labels = { "eve.io/project": p.slug, "eve.io/build": name };
  const target = `${REGISTRY_PUSH}/eve/${p.slug}:${sha}`;
  await apply(`/api/v1/namespaces/${BUILDS}/secrets/${name}`, {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name, namespace: BUILDS, labels },
    stringData: { GITHUB_TOKEN: githubToken },
  });
  await apply(`/apis/batch/v1/namespaces/${BUILDS}/jobs/${name}`, {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name, namespace: BUILDS, labels, annotations: { "eve.io/sha": sha, "eve.io/repo": p.repo, "eve.io/message": message.split("\n")[0].slice(0, 200) } },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: 1800,
      ttlSecondsAfterFinished: 86400,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: "Never",
          automountServiceAccountToken: false,
          securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: "RuntimeDefault" } },
          initContainers: [
            {
              name: "source",
              image: "alpine/git:2.47.2",
              command: ["sh", "-c"],
              args: [
                `set -e; cd /workspace; git config --global --add safe.directory /workspace; git init -q; git remote add origin "https://x-access-token:$GITHUB_TOKEN@github.com/${p.repo}.git"; ` +
                  `git fetch -q --depth 1 origin ${sha}; git checkout -q FETCH_HEAD; rm -rf .git`,
              ],
              env: [{ name: "GITHUB_TOKEN", valueFrom: { secretKeyRef: { name, key: "GITHUB_TOKEN" } } }, { name: "HOME", value: "/tmp" }],
              resources: { requests: { cpu: "50m", memory: "64Mi" }, limits: { memory: "256Mi" } }, // namespace quotas require limits
              volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
              securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
            },
          ],
          containers: [
            {
              name: "build",
              image: BUILDER,
              command: ["/cnb/lifecycle/creator"],
              args: ["-app=/workspace", "-layers=/layers", "-platform=/platform", "-log-level=info", target],
              env: [
                { name: "CNB_PLATFORM_API", value: "0.13" },
                { name: "CNB_INSECURE_REGISTRIES", value: REGISTRY_PUSH },
              ],
              resources: { requests: { cpu: "500m", memory: "1Gi" }, limits: { cpu: "2", memory: "3Gi" } },
              volumeMounts: [
                { name: "workspace", mountPath: "/workspace" },
                { name: "layers", mountPath: "/layers" },
                { name: "platform", mountPath: "/platform" },
              ],
              securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
            },
          ],
          volumes: [
            { name: "workspace", emptyDir: { sizeLimit: "2Gi" } },
            { name: "layers", emptyDir: { sizeLimit: "4Gi" } },
            { name: "platform", emptyDir: {} },
          ],
        },
      },
    },
  });
  return name;
}

export type Build = { name: string; sha: string; message: string; state: "running" | "succeeded" | "failed"; started: string };

export async function listBuilds(slug: string): Promise<Build[]> {
  const r = await k8s("GET", `/apis/batch/v1/namespaces/${BUILDS}/jobs?labelSelector=eve.io%2Fproject%3D${slug}`);
  return r.items
    .map((j: any) => ({
      name: j.metadata.name,
      sha: j.metadata.annotations?.["eve.io/sha"] ?? "",
      message: j.metadata.annotations?.["eve.io/message"] ?? "",
      state: j.status?.succeeded ? "succeeded" : j.status?.failed ? "failed" : "running",
      started: j.metadata.creationTimestamp,
    }))
    .sort((a: Build, b: Build) => b.started.localeCompare(a.started));
}

// Point the project at an earlier successful build (Argo CD redeploys it). The latest build no longer
// auto-promotes over a rollback until a newer build succeeds.
export async function rollback(p: Project, sha: string): Promise<void> {
  const ok = (await listBuilds(p.slug)).some((b) => b.state === "succeeded" && b.sha === sha);
  if (!ok) throw new Error("no successful build for that commit");
  await k8s("PATCH", `/api/v1/namespaces/${PROJECTS}/configmaps/${p.slug}?fieldManager=eve-console-deploy&force=true`, {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: p.slug, namespace: PROJECTS },
    data: { image: `${REGISTRY_PULL}/eve/${p.slug}:${sha}`, sha, pinned: "true" },
  });
}

// After a build succeeds, point the project at the new image (Argo CD then deploys it).
export async function promoteSucceeded(p: Project): Promise<Project> {
  const builds = await listBuilds(p.slug);
  const latest = builds.find((b) => b.state === "succeeded");
  if (!latest || latest.sha === p.sha) return p;
  if (p.pinned) {
    // After a rollback only a build started later than the pinned one moves production forward.
    const pinnedAt = builds.find((b) => b.sha === p.sha)?.started ?? "";
    if (latest.started <= pinnedAt) return p;
  }
  const image = `${REGISTRY_PULL}/eve/${p.slug}:${latest.sha}`;
  await k8s("PATCH", `/api/v1/namespaces/${PROJECTS}/configmaps/${p.slug}?fieldManager=eve-console-deploy&force=true`, {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: p.slug, namespace: PROJECTS },
    data: { image, sha: latest.sha, pinned: "" },
  });
  return { ...p, image, sha: latest.sha };
}

export async function deployStatus(slug: string): Promise<{ sync: string; health: string } | null> {
  try {
    const app = await k8s("GET", `/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/p-${slug}`);
    return { sync: app.status?.sync?.status ?? "Unknown", health: app.status?.health?.status ?? "Unknown" };
  } catch (e) {
    if (e instanceof NotFound) return null;
    throw e;
  }
}

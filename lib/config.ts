// All configuration comes from the environment (Kubernetes Secret + ConfigMap).
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export const config = {
  publicUrl: () => required("PUBLIC_URL"), // e.g. https://app.evelab.space
  githubClientId: () => required("GITHUB_APP_CLIENT_ID"),
  githubClientSecret: () => required("GITHUB_APP_CLIENT_SECRET"),
  githubAppSlug: () => required("GITHUB_APP_SLUG"),
  sessionSecret: () => required("SESSION_SECRET"), // >= 32 characters
  chatUrl: () => process.env.CHAT_URL ?? "https://librechat.evelab.space",
};

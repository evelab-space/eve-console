// Browser telemetry (Grafana Faro), started before the app becomes interactive. Runtime settings come
// from <meta> tags rendered by the root layout (the server knows FARO_URL, the version and the user).
import { faro, getWebInstrumentations, initializeFaro } from "@grafana/faro-web-sdk";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";

const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? "";

try {
  const url = meta("eve-faro-url");
  if (url) {   // this file runs once per page load; the SDK exposes faro.api before init, so no guard on it
    const f = initializeFaro({
      url,
      app: { name: "eve-console", version: meta("eve-version") || "dev", environment: "local" },
      instrumentations: [...getWebInstrumentations({ captureConsole: true }), new TracingInstrumentation()],
      sessionTracking: { enabled: true, persistent: true },
    });
    const user = meta("eve-user");
    if (user) f.api.setUser({ username: user });
  }
} catch (e) {
  console.warn("telemetry disabled", e);
}

// Page views for client-side navigations.
export function onRouterTransitionStart(url: string) {
  try {
    faro.api?.setView({ name: new URL(url, location.origin).pathname });
  } catch {}
}

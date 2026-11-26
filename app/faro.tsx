"use client";

// Browser telemetry with Grafana Faro: page views, JS errors, Web Vitals, console errors, user actions
// and frontend traces (propagated to the console's own API, so browser and server spans join up).
import { useEffect } from "react";
import { getWebInstrumentations, initializeFaro, faro } from "@grafana/faro-web-sdk";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";

export function Faro({ url, version, user }: { url: string; version: string; user?: string }) {
  useEffect(() => {
    if (!url) return;
    if (!faro.api) {
      initializeFaro({
        url,
        app: { name: "eve-console", version, environment: "local" },
        instrumentations: [...getWebInstrumentations({ captureConsole: true }), new TracingInstrumentation()],
        sessionTracking: { enabled: true, persistent: true },
      });
    }
    if (user) faro.api?.setUser({ username: user });
    else faro.api?.resetUser();
  }, [url, version, user]);
  return null;
}

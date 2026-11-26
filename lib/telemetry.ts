// Business context on top of the zero-code OpenTelemetry agent (injected by the operator):
// - tag(): who/what on the active request span (user, project, action)
// - event(): one structured log line per user action (Loki via the node collector) + a span event
import { trace } from "@opentelemetry/api";

type Attrs = Record<string, string | number | boolean | undefined>;

function clean(a: Attrs) {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)) as Record<string, string | number | boolean>;
}

export function tag(attrs: Attrs) {
  trace.getActiveSpan()?.setAttributes(clean(attrs));
}

export function event(name: string, attrs: Attrs = {}) {
  const a = clean(attrs);
  const span = trace.getActiveSpan();
  span?.addEvent(name, a);
  const ctx = span?.spanContext();
  console.log(JSON.stringify({ level: "info", event: name, ...a, trace_id: ctx?.traceId, ts: new Date().toISOString() }));
}

"use client";

import { useEffect, useState } from "react";

// Minimal toasts: toast("text") / toast("text", "error") from any client component.
type T = { id: number; text: string; kind: "info" | "error" };
let push: (t: Omit<T, "id">) => void = () => {};

export function toast(text: string, kind: "info" | "error" = "info") {
  push({ text, kind });
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 5000);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
            t.kind === "error" ? "border-red-900 bg-red-950 text-red-200" : "border-neutral-700 bg-neutral-900 text-neutral-100"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

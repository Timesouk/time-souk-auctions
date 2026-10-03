"use client";
// Small helpers for admin forms: run a server action, show its message.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Result } from "@/app/(admin)/admin/actions";

export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result | null>(null);
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) router.refresh();
      after?.(r);
    });
  return { pending, msg, setMsg, run };
}

export function Msg({ r }: { r: Result | null }) {
  if (!r) return null;
  return <p className={`alert ${r.ok ? "ok" : ""}`} role="status">{r.message}</p>;
}

/** A button that asks "are you sure?" by changing its label on the first click. */
export function ConfirmButton({ label, confirm, onConfirm, className = "btn sm", disabled }: { label: string; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={`${className}${armed ? " strong" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 5000);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

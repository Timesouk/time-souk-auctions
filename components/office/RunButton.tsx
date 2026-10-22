"use client";
import { Msg, useAction } from "@/components/admin/ui";
import type { Result } from "@/app/(admin)/admin/actions";

/** A button that runs one server action and shows its answer. */
export function RunButton({ label, busy, run, className = "btn" }: { label: string; busy?: string; run: () => Promise<Result>; className?: string }) {
  const { pending, msg, run: go } = useAction();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button type="button" className={className} disabled={pending} onClick={() => go(run)}>
        {pending ? busy || "Working…" : label}
      </button>
      <Msg r={msg} />
    </div>
  );
}

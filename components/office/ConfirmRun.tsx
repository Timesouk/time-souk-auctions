"use client";
// A button that asks "Are you sure…?" before running one server action, then shows its answer (and can move on to another page).
import { useRouter } from "next/navigation";
import { Msg, useAction } from "@/components/admin/ui";
import type { Result } from "@/app/(admin)/admin/actions";

export function ConfirmRun({
  label, ask, run, className = "btn sm danger", then
}: { label: string; ask: string; run: () => Promise<Result>; className?: string; then?: string }) {
  const { pending, msg, run: go } = useAction();
  const router = useRouter();
  return (
    <span className="stack" style={{ gap: 6, display: "inline-flex" }}>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(ask)) return;
          go(run, r => {
            if (r.ok && then) setTimeout(() => router.push(then), 1200);
            else if (r.ok) router.refresh();
          });
        }}
      >
        {pending ? "Working…" : label}
      </button>
      <Msg r={msg} />
    </span>
  );
}

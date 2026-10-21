"use client";
// Settings › Demo auction: make, reset or remove the training auction.
import { useRouter } from "next/navigation";
import { Msg, useAction } from "@/components/admin/ui";
import { createDemoAuction, removeDemoAuction, resetDemoAuction } from "@/app/(admin)/admin/office/demo-actions";

export function DemoPanel({ demo }: { demo: { number: number; lots: number; sold: number; buyers: number } | null }) {
  const router = useRouter();
  const { pending, msg, run } = useAction();
  const go = (fn: () => ReturnType<typeof createDemoAuction>, ask?: string) => {
    if (ask && !window.confirm(ask)) return;
    run(fn, r => r.ok && router.refresh());
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      {demo ? (
        <>
          <p>
            Demo auction <b>{demo.number}</b> · {demo.lots} lots · {demo.sold} sold so far · {demo.buyers} demo {demo.buyers === 1 ? "buyer" : "buyers"}.{" "}
            <a href={`/admin/office/lots?a=${demo.number}`}>Open it</a>
          </p>
          <div className="row">
            <button type="button" className="btn pri" disabled={pending} onClick={() => go(resetDemoAuction, "Are you sure you want to reset the demo auction?\n\nIts results, payments, messages and demo buyers are deleted, and fresh lots are put in.")}>
              {pending ? "Working…" : "Reset for the next session"}
            </button>
            <button type="button" className="btn danger" disabled={pending} onClick={() => go(removeDemoAuction, "Are you sure you want to remove the demo auction?\n\nIt is deleted with its demo buyers and sellers.")}>
              Remove the demo
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn pri" disabled={pending} onClick={() => go(createDemoAuction)}>
            {pending ? "Making it…" : "Make the demo auction"}
          </button>
        </div>
      )}
      <Msg r={msg} />
    </div>
  );
}

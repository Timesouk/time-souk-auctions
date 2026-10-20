"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markSlipsPrinted } from "@/app/(admin)/admin/office/actions2";

/** Prints the slips on the page (80 mm receipt printer) and notes them as printed. */
export function SlipPrint({ ids, label }: { ids: string[]; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn pri"
      disabled={!ids.length || busy}
      onClick={async () => {
        setBusy(true);
        window.print();
        await markSlipsPrinted(ids);
        setBusy(false);
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}

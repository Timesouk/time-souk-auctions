import "../../../office.css";
import { Suspense } from "react";
import { OfficeNav } from "@/components/office/OfficeNav";
import { IS_PREVIEW } from "@/lib/env";

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="office">
      <Suspense fallback={<nav className="office-nav" />}>
        <OfficeNav />
      </Suspense>
      {IS_PREVIEW ? <p className="alert info no-print">Preview mode: made-up sample records. Nothing you type is saved.</p> : null}
      {children}
    </div>
  );
}

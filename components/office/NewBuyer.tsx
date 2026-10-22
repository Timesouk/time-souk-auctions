"use client";
import { useRouter } from "next/navigation";
import { CustomerForm, blankCustomer } from "./forms";

export function NewBuyer() {
  const router = useRouter();
  return (
    <details className="panel-card">
      <summary><strong>Add a buyer</strong></summary>
      <CustomerForm value={blankCustomer()} onSaved={code => router.push(`/admin/office/buyers/${code}`)} />
    </details>
  );
}

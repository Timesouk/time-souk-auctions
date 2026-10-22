import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { Wording, langCode, receiptMessage } from "@/lib/office/messages";
import { receiptUrl } from "@/lib/office/links";
import { auctionChoices, intakeRow } from "@/lib/office/intake-view";
import { SetupNeeded } from "@/components/office/bits";
import { ReceiptDoc } from "@/components/office/SellerDocs";
import { AddLines, IntakeTable } from "@/components/office/forms2";
import { CopyButton, PrintButton } from "@/components/office/forms";
import { WaButton } from "@/components/office/Wa";

export const dynamic = "force-dynamic";

export default async function IntakeReceipt({ params }: { params: Promise<{ receipt: string }> }) {
  const { receipt } = await params;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const no = decodeURIComponent(receipt).toUpperCase();
  const items = o.intake.filter(i => i.receipt_no.toUpperCase() === no);
  if (!items.length) return <p className="empty">No receipt {no}. <Link href="/admin/office/intake">Intake</Link></p>;
  const s = o.data.settings;
  const seller = items[0].seller;
  const code = langCode(s.wa_lang);
  const url = receiptUrl(no, code === "AR" ? "ar" : "en");
  const feePct = items[0].fee_pct ?? seller?.fee_pct ?? s.fee_pct;
  const feeFixed = items[0].fee_fixed ?? seller?.fee_fixed ?? s.fee_fixed;
  const text = receiptMessage(new Wording(s, o.data.messages), {
    code, receipt: no, date: items[0].received_on, name: seller?.name || "", items: items.map(i => ({ brand: i.brand, model: i.model, reference: i.reference, serial: i.serial, reserve: i.reserve })),
    feePct, feeFixed, url
  });
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head no-print">
        <div>
          <h1 className="disp">Receipt {no}</h1>
          <p className="fine">{seller ? <Link href={`/admin/office/sellers/${seller.code}`}>{seller.code} · {seller.name}</Link> : "No seller"} · {items.length} watch{items.length === 1 ? "" : "es"}</p>
        </div>
        <div className="row">
          <WaButton label="Send on WhatsApp" className="btn pri" phone={seller?.phone || ""} text={text} mode={s.wa_mode}
            log={{ ref: no, name: seller?.name || "", total: null, balance: null, kind: "Intake receipt", link: "" }} />
          <PrintButton label="Print for signing / PDF" />
          <CopyButton text={url} label="Copy seller's link" />
        </div>
      </div>
      <ReceiptDoc receipt={no} items={items} seller={seller} s={s} />
      <AddLines receipt={no} />
      <section className="stack no-print" style={{ gap: 8 }}>
        <h2 className="h-sec">Where each watch is now</h2>
        <IntakeTable rows={items.map(intakeRow)} auctions={auctionChoices(o)} showReceipt={false} />
      </section>
      {!s.intake_terms ? <p className="fine no-print">Add the intake declaration under Settings (it prints above the signatures). Have a lawyer review the wording.</p> : null}
    </div>
  );
}

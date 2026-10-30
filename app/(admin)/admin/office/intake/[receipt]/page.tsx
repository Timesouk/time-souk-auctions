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
import { ConfirmRun } from "@/components/office/ConfirmRun";
import { deleteIntakeItem, deleteIntakeReceipt } from "../../actions2";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

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
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  const inAuction = items.filter(i => i.lot);
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
      {admin ? (
        <section className="panel-card no-print">
          <span className="k">Entered by mistake?</span>
          <p className="fine">
            Delete the whole receipt, or remove one watch from it. A watch that&apos;s already a lot in an auction can&apos;t be removed here: delete that lot first (Lots › Delete), as long as it has no result.
            Once a seller has no receipts, lots or payments left, you can delete the seller on their page. Admins only.
          </p>
          <div className="row" style={{ gap: 6 }}>
            {items.map(i => (
              <ConfirmRun
                key={i.id}
                label={`Remove ${i.item_id}`}
                className="btn sm"
                ask={`Remove ${i.item_id} (${`${i.brand} ${i.model}`.trim()}) from receipt ${no}?\n\nThis can't be undone.`}
                run={deleteIntakeItem.bind(null, i.id)}
                then={items.length === 1 ? "/admin/office/intake" : undefined}
              />
            ))}
          </div>
          <div className="row">
            <ConfirmRun
              label={`Delete receipt ${no}`}
              className="btn danger"
              ask={`Delete receipt ${no} and its ${items.length} watch${items.length === 1 ? "" : "es"}?${inAuction.length ? `\n\n${inAuction.length} of them ${inAuction.length === 1 ? "is" : "are"} in an auction: delete ${inAuction.length === 1 ? "that lot" : "those lots"} first.` : ""}\n\nThis can't be undone.`}
              run={deleteIntakeReceipt.bind(null, no)}
              then={seller ? `/admin/office/sellers/${seller.code}` : "/admin/office/intake"}
            />
          </div>
        </section>
      ) : null}
      {!s.intake_terms ? <p className="fine no-print">Add the intake declaration under Settings (it prints above the signatures). Have a lawyer review the wording.</p> : null}
    </div>
  );
}

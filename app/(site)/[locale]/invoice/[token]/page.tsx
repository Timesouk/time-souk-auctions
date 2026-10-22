import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadOffice } from "@/lib/office/load";
import { verifyRef } from "@/lib/office/links";
import { InvoiceDoc } from "@/components/office/InvoiceDoc";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

/** The buyer's own invoice, opened from the link in their WhatsApp message. */
export default async function BuyerInvoice({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { token, locale } = await params;
  const no = verifyRef(token);
  if (!no) notFound();
  const o = await loadOffice().catch(() => null);
  const inv = o?.invoicesByNo.get(no);
  if (!o || !inv) {
    return (
      <div className="wrap narrow" style={{ paddingBlock: 40 }}>
        <p className="alert">{locale === "ar" ? "هذه الفاتورة لم تعد متاحة. تواصل معنا على واتساب." : "This invoice isn't available any more. Please contact us on WhatsApp."}</p>
      </div>
    );
  }
  return (
    <div className="wrap" style={{ paddingBlock: 28 }} dir="ltr">
      <div className="row no-print" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <PrintButton label={locale === "ar" ? "طباعة / حفظ PDF" : "Print / save as PDF"} />
      </div>
      <InvoiceDoc inv={inv} s={o.data.settings} />
    </div>
  );
}

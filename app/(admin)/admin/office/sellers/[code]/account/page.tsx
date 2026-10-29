import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { sellerAccount, sellerNowAndLater } from "@/lib/office/seller-account";
import { SetupNeeded } from "@/components/office/bits";
import { AccountDoc } from "@/components/office/SellerDocs";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";

/** A consignor's whole account with us, every auction: printable to send them. */
export default async function SellerAccountPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const seller = o.data.sellers.find(s => s.code.toUpperCase() === decodeURIComponent(code).toUpperCase());
  if (!seller) return <p className="empty">No seller {code}. <Link href="/admin/office/sellers">All sellers</Link></p>;
  const acct = sellerAccount(o, seller.id);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head no-print">
        <div>
          <h1 className="disp">Account · {seller.code}</h1>
          <p className="fine">Every sold watch, every payment buyers made to {seller.name} directly (for their watches or anyone else&apos;s), and every payment between us, with the running balance.</p>
        </div>
        <div className="row">
          <Link className="btn sm" href={`/admin/office/sellers/${seller.code}`}>Back to the seller</Link>
          <PrintButton />
        </div>
      </div>
      <AccountDoc seller={seller} acct={acct} s={o.data.settings} asOf={o.today} now={sellerNowAndLater(o, seller.id).now} />
    </div>
  );
}

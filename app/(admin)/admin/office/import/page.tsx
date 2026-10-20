import { loadOfficeData } from "@/lib/office/load";
import { DEFAULT_SETTINGS } from "@/lib/office/types";
import { ImportWorkbook } from "@/components/office/ImportWorkbook";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function OfficeImport() {
  const staff = IS_PREVIEW ? null : await getStaff();
  if (!IS_PREVIEW && staff?.role !== "admin") return <p className="alert">Only the admin can import the workbook.</p>;
  const data = await loadOfficeData().catch(() => null);
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 980 }}>
      <div>
        <h1 className="disp">Import the workbook</h1>
        <p className="fine">
          Bring everything from <b>Time Souk Auction Manager</b> (Excel) into the back office: auctions, lots and results, buyers, sellers, intake, payments, adjustments, the sent log, card links,
          settings and your WhatsApp wording. Save the workbook in Excel first, so its latest figures are in the file.
        </p>
      </div>
      <ul className="plain fine">
        <li>Auctions that aren&apos;t on the website yet are added as <b>drafts</b>, so they don&apos;t appear to bidders.</li>
        <li>Lots already on the website keep their photos and descriptions; only the office fields (seller, reserve, winner, hammer, delivery, payouts) are filled in.</li>
        <li>The co-branded name (<b>{data?.settings.brand_name || DEFAULT_SETTINGS.brand_name}</b>) stays as set here.</li>
      </ul>
      <ImportWorkbook settings={data?.settings || DEFAULT_SETTINGS} />
    </div>
  );
}

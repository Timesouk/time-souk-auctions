import { loadOfficeData } from "@/lib/office/load";
import { MESSAGES } from "@/lib/office/messages";
import { SetupNeeded } from "@/components/office/bits";
import { MessageEditor, OfficeSettingsForm } from "@/components/office/SettingsForms";
import { DemoPanel } from "@/components/office/DemoPanel";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function OfficeSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const staff = IS_PREVIEW ? null : await getStaff();
  if (!IS_PREVIEW && staff?.role !== "admin") return <p className="alert">Only the admin can change the back office settings.</p>;
  const data = await loadOfficeData().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const tab = sp.tab === "messages" ? "messages" : sp.tab === "demo" ? "demo" : "settings";
  const da = data.auctions.find(a => a.demo);
  const demo = da
    ? {
        number: da.number, lots: data.lots.filter(l => l.auction_id === da.id).length,
        sold: data.lots.filter(l => l.auction_id === da.id && (l.hammer || 0) > 0 && !l.exception).length, buyers: data.customers.filter(c => c.demo).length
      }
    : null;
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 1100 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Back office settings</h1>
          <p className="fine">Fill these in once. Everything printed on invoices, statements and receipts, and every WhatsApp message, comes from here.</p>
        </div>
      </div>
      <div className="chips">
        <a className="chip" href="/admin/office/settings" aria-pressed={tab === "settings"}>Company, bank, fees and terms</a>
        <a className="chip" href="/admin/office/settings?tab=messages" aria-pressed={tab === "messages"}>WhatsApp wording<small>{Object.keys(data.messages).length} edited</small></a>
        <a className="chip" href="/admin/office/settings?tab=demo" aria-pressed={tab === "demo"}>Demo auction (training){demo ? <small>auction {demo.number}</small> : null}</a>
      </div>
      {tab === "settings" ? <OfficeSettingsForm value={data.settings} /> : null}
      {tab === "messages" ? <MessageEditor messages={MESSAGES} overrides={data.messages} /> : null}
      {tab === "demo" ? (
        <section className="panel-card stack" style={{ gap: 12, maxWidth: 820 }}>
          <span className="k">Demo auction for training staff</span>
          <p className="fine">
            A practice auction (number 999) with ten made-up watches, two demo sellers (DEMO-C consignment, DEMO-O own stock) and three demo buyers (D0001–D0003).
            Staff can run the whole flow on it: live results, sold slips, invoices, WhatsApp, payments (including a buyer paying the seller directly), dispatch, seller payouts and statements, and intake for the demo sellers.
          </p>
          <ul className="plain fine">
            <li>It never goes on the website, and it&apos;s left out of the accounts, the summary totals and the &ldquo;every auction&rdquo; lists.</li>
            <li>It only takes demo buyers and sellers. A new handle typed as a winner becomes a demo buyer (D0004…). Real buyers can&apos;t win demo lots.</li>
            <li>Card links are switched off. WhatsApp messages go to whatever number a demo buyer has: give one your own number to see them arrive.</li>
            <li>Reset clears everything staff did and puts fresh lots in, ready for the next session.</li>
          </ul>
          <DemoPanel demo={demo} />
        </section>
      ) : null}
    </div>
  );
}

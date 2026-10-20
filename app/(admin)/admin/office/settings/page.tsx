import { loadOfficeData } from "@/lib/office/load";
import { MESSAGES } from "@/lib/office/messages";
import { SetupNeeded } from "@/components/office/bits";
import { MessageEditor, OfficeSettingsForm } from "@/components/office/SettingsForms";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function OfficeSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const staff = IS_PREVIEW ? null : await getStaff();
  if (!IS_PREVIEW && staff?.role !== "admin") return <p className="alert">Only the admin can change the back office settings.</p>;
  const data = await loadOfficeData().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const tab = sp.tab === "messages" ? "messages" : "settings";
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
      </div>
      {tab === "settings" ? <OfficeSettingsForm value={data.settings} /> : <MessageEditor messages={MESSAGES} overrides={data.messages} />}
    </div>
  );
}

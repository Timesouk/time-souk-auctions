import { AcctNav } from "@/components/office/AcctNav";

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <AcctNav />
      {children}
    </div>
  );
}

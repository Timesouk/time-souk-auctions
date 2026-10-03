import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap pagehead">
      <span className="kick">404</span>
      <h1 className="disp">Not found · غير موجود</h1>
      <p className="lede">This page doesn’t exist. · هذه الصفحة غير موجودة.</p>
      <div className="row">
        <Link className="btn pri" href="/en">The Time Souk</Link>
        <Link className="btn" href="/ar">تايم سوق</Link>
      </div>
    </section>
  );
}

type Doc = { updated: string; intro: string; sections: [string, string[]][] };

export function LegalDoc({ title, doc }: { title: string; doc: Doc }) {
  return (
    <>
      <section className="wrap pagehead">
        <h1 className="disp">{title}</h1>
        <p className="fine">{doc.updated}</p>
      </section>
      <section className="wrap sec">
        <div className="legal">
          <p className="lede">{doc.intro}</p>
          {doc.sections.map(([h, ps]) => (
            <div key={h}>
              <h2>{h}</h2>
              {ps.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

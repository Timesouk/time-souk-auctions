export function Ticker({ items }: { items: string[] }) {
  const row = items.flatMap(x => [x, "•"]);
  const all = [...row, ...row];
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {all.map((x, i) => (
          <span key={i}>{x}</span>
        ))}
      </div>
    </div>
  );
}

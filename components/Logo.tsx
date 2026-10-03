/** The stacked THE / TIME / SOUK wordmark in yellow, cyan and red. */
export function Logo({ height = 52, mono }: { height?: number; mono?: string }) {
  return (
    <svg className="logo" viewBox="0 0 150 132" style={{ height }} role="img" aria-label="The Time Souk">
      <g
        fontFamily="'Archivo Black', 'Arial Black', sans-serif"
        fontSize="40"
        stroke={mono ? "none" : "#121417"}
        strokeWidth="7"
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        <text x="5" y="39" fill={mono || "#FFD23F"} textLength="140" lengthAdjust="spacingAndGlyphs">THE</text>
        <text x="5" y="82" fill={mono || "#1E9BD7"} textLength="140" lengthAdjust="spacingAndGlyphs">TIME</text>
        <text x="5" y="125" fill={mono || "#E23B2E"} textLength="140" lengthAdjust="spacingAndGlyphs">SOUK</text>
      </g>
    </svg>
  );
}

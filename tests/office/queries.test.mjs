// Lots and auctions are linked twice (lots.auction_id and auctions.block_lot_id), so Supabase can't embed one in the
// other without being told which link: every such query must name it (auctions!lots_auction_id_fkey(...)).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
function files(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

test("no query embeds auctions or lots without naming the link", () => {
  const bad = [];
  for (const f of [...files(join(root, "app")), ...files(join(root, "lib")), ...files(join(root, "components"))]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\.select\(([`"'])([\s\S]*?)\1/g)) {
      const sel = m[2];
      if (/(^|[\s,(])auctions\(/.test(sel)) bad.push(`${f.replace(root, "")}: ${sel.slice(0, 80)}`);
      if (/(^|[\s,(])lots\(/.test(sel) && /from\("auctions"\)\s*$/.test(src.slice(Math.max(0, m.index - 40), m.index).trim())) bad.push(`${f.replace(root, "")}: ${sel.slice(0, 80)}`);
    }
  }
  assert.deepEqual(bad, []);
});

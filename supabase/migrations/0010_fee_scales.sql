-- Back office, part 5: seller fee scales, a fee that depends on what the watch sold for. Run after 0009
-- (Supabase › SQL Editor › New query › paste › Run). Safe to run again: nothing is dropped and no data is changed.
--
-- A scale is a list of price bands, e.g. sold for up to AED 5,000: AED 300 fixed; up to 20,000: 7.5%; above: 5%.
-- Stored as { "from": "2026-11-01", "bands": [{ "upTo": 5000, "pct": 0, "fixed": 300 }, …, { "upTo": null, "pct": 5, "fixed": 0 }] }:
-- the last band has "upTo": null (everything above); "from" is the first auction date it applies to (null: every auction).
-- office_settings.fee_scale is the standard scale ([] = use the standard % and fixed fee, as before).
-- sellers.fee_scale is a seller's own scale (null = the seller's own % / fixed fee, or the standard).

alter table public.office_settings add column if not exists fee_scale jsonb not null default '[]'::jsonb;
alter table public.sellers add column if not exists fee_scale jsonb;

notify pgrst, 'reload schema';

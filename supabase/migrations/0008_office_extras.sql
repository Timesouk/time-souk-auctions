-- Back office, part 3. Run after 0006 and 0007 (Supabase › SQL Editor › New query › paste › Run).
-- Safe to run again: nothing is dropped and no data is changed.
--
--  · Instagram-only auctions: published for the Instagram live while staying off the website.
--  · A demo auction for training staff, with its own demo buyers and sellers, kept out of the books.
--  · Buyers who pay the consignor directly: the payment names the seller who received it.
--  · Seller payouts remember the cash that actually moved (it differs from the lot's net when a buyer paid the seller directly).

alter table public.auctions add column if not exists instagram boolean not null default false;
alter table public.auctions add column if not exists demo boolean not null default false;
alter table public.customers add column if not exists demo boolean not null default false;
alter table public.sellers add column if not exists demo boolean not null default false;
alter table public.ledger add column if not exists paid_to_seller_id uuid references public.sellers(id) on delete restrict;
alter table public.lot_private add column if not exists payout_amount numeric(12,2);

comment on column public.auctions.instagram is 'Published for the Instagram live. The website still shows the auction only when status is published.';
comment on column public.auctions.demo is 'Training auction: never on the website, kept out of the accounts and totals.';
comment on column public.ledger.paid_to_seller_id is 'Set when the buyer paid the consignor directly (method "Paid to seller directly").';
comment on column public.lot_private.payout_amount is 'Cash that moved when the seller was settled: positive = we paid them, negative = they paid us. Blank = the lot''s net.';

-- A demo auction never goes on the website.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auctions_demo_draft') then
    alter table public.auctions add constraint auctions_demo_draft check (not demo or status = 'draft');
  end if;
end $$;

create index if not exists ledger_paid_to_seller_idx on public.ledger (paid_to_seller_id) where paid_to_seller_id is not null;

notify pgrst, 'reload schema';

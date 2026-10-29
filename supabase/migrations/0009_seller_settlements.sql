-- Back office, part 4: settling a consignor's account outside a lot payout. Run after 0008
-- (Supabase › SQL Editor › New query › paste › Run). Safe to run again: nothing is dropped and no data is changed.
--
-- A buyer sometimes pays a consignor they know, even for another seller's watch or our own stock. That money is ours
-- (or the other seller's), so it comes off the consignor's next payout; when there's no payout to take it from,
-- the consignor pays it back to us. Each such settlement is one row here:
--   amount > 0  we paid the seller (on account)
--   amount < 0  the seller paid us

create table if not exists public.seller_settlements (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete restrict,
  entry_date date not null default ((now() at time zone 'Asia/Dubai')::date),
  amount numeric(12,2) not null,
  account_code text not null default '',
  reference text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'seller_settlements_amount_check') then
    alter table public.seller_settlements add constraint seller_settlements_amount_check check (amount <> 0);
  end if;
end $$;

create index if not exists seller_settlements_seller_idx on public.seller_settlements (seller_id, entry_date);

-- Staff read it; only the server (service role) writes it.
alter table public.seller_settlements enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'seller_settlements' and policyname = 'seller_settlements_staff') then
    create policy seller_settlements_staff on public.seller_settlements for select using (public.is_staff());
  end if;
end $$;
revoke all on public.seller_settlements from anon;
revoke insert, update, delete on public.seller_settlements from authenticated;
grant select on public.seller_settlements to authenticated;
grant all on public.seller_settlements to service_role;

notify pgrst, 'reload schema';

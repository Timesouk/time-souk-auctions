-- The Time Souk · 0007: accounting (double entry) for the back office.
-- Run once in the Supabase SQL Editor, after 0006. Safe to run again. It only adds tables, columns and two functions.
--
-- How it works
--   Sales, seller fees, cost of own stock, payments, deposits, refunds and seller payouts are journalled
--   automatically from the back office's records (nothing to type twice). What the back office can't know
--   (expenses, stock bought, transfers between accounts, money the owners put in or take out, opening balances,
--   corrections) is entered as balanced entries here, through acct_post() only.
--
-- What it adds
--   acct_accounts         the chart of accounts (a UAE watch dealer's starting set; rename or add your own)
--   acct_entries/lines    entries typed in the back office, each one balanced (debits = credits)
--   acct_cleared          lines ticked off against a bank statement
--   acct_reconciliations  each bank reconciliation saved
--   office_settings       + which account each payment method lands in, the default payout account,
--                           and "books closed up to" (no changes on or before that date)
--   lot_private           + the account a seller was paid from

-- ───────────────────────────── chart of accounts ─────────────────────────────

create table if not exists public.acct_accounts (
  code text primary key check (code ~ '^[0-9]{3,6}$'),
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  subtype text not null default '',
  -- system accounts are used by the automatic journal: they can be renamed, not removed
  system boolean not null default false,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

insert into public.acct_accounts (code, name, type, subtype, system) values
  ('1010', 'Cash on hand', 'asset', 'cash', true),
  ('1020', 'Bank: current account', 'asset', 'bank', true),
  ('1030', 'Ziina (card payments) to receive', 'asset', 'clearing', true),
  ('1040', 'Tabby to receive', 'asset', 'clearing', true),
  ('1050', 'Tamara to receive', 'asset', 'clearing', true),
  ('1060', 'Cash on delivery with the courier', 'asset', 'clearing', true),
  ('1100', 'Buyers owe us (accounts receivable)', 'asset', 'receivable', true),
  ('1200', 'Watches in stock (own stock, at cost)', 'asset', 'inventory', true),
  ('1300', 'VAT recoverable (input VAT)', 'asset', 'tax', true),
  ('1400', 'Prepayments and deposits paid', 'asset', '', false),
  ('1500', 'Equipment', 'asset', 'fixed', false),
  ('1900', 'Suspense (to sort out)', 'asset', 'suspense', true),
  ('2010', 'Suppliers we owe (accounts payable)', 'liability', 'payable', true),
  ('2100', 'Owed to consignors', 'liability', 'consignor', true),
  ('2200', 'Buyers'' deposits held', 'liability', 'deposits', true),
  ('2300', 'VAT payable (output VAT)', 'liability', 'tax', true),
  ('2400', 'Accrued expenses', 'liability', '', false),
  ('2500', 'Loans from owners', 'liability', '', true),
  ('3010', 'Owners'' capital', 'equity', 'capital', true),
  ('3050', 'Opening balances', 'equity', 'opening', true),
  ('3100', 'Owners'' drawings', 'equity', 'drawings', true),
  ('3900', 'Retained earnings', 'equity', 'retained', true),
  ('4010', 'Sales: own-stock watches', 'income', 'sales', true),
  ('4100', 'Seller fees (consignment commission)', 'income', 'commission', true),
  ('4200', 'Delivery charges', 'income', '', true),
  ('4300', 'Cash on delivery charges', 'income', '', true),
  ('4400', 'Card payment fees charged', 'income', '', true),
  ('4500', 'Other charges on invoices', 'income', '', true),
  ('4600', 'Discounts given', 'income', 'contra', true),
  ('4900', 'Other income', 'income', '', true),
  ('5010', 'Cost of own-stock watches sold', 'expense', 'cogs', true),
  ('5100', 'Servicing and repairs before sale', 'expense', 'cogs', false),
  ('6010', 'Courier and delivery', 'expense', '', true),
  ('6020', 'Payment processing fees (Ziina, Tabby, Tamara)', 'expense', '', true),
  ('6030', 'Bank charges', 'expense', '', true),
  ('6100', 'Marketing and advertising', 'expense', '', false),
  ('6110', 'Photography and content', 'expense', '', false),
  ('6200', 'Salaries and wages', 'expense', '', false),
  ('6210', 'Commissions paid', 'expense', '', false),
  ('6300', 'Rent', 'expense', '', false),
  ('6310', 'Utilities, phone and internet', 'expense', '', false),
  ('6400', 'Software and subscriptions', 'expense', '', false),
  ('6410', 'Website and hosting', 'expense', '', false),
  ('6500', 'Licences and government fees', 'expense', '', false),
  ('6510', 'Legal and accounting', 'expense', '', false),
  ('6600', 'Packaging and supplies', 'expense', '', false),
  ('6700', 'Travel', 'expense', '', false),
  ('6800', 'Insurance', 'expense', '', false),
  ('6900', 'Other expenses', 'expense', '', true)
on conflict (code) do nothing;

-- ───────────────────────────── entries typed in the back office ─────────────────────────────

create table if not exists public.acct_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  kind text not null default 'journal',
  memo text not null default '',
  payee text not null default '',
  reference text not null default '',
  void boolean not null default false,
  void_reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.acct_entries drop constraint if exists acct_entries_kind_check;
alter table public.acct_entries add constraint acct_entries_kind_check
  check (kind in ('expense', 'income', 'purchase', 'transfer', 'owner', 'opening', 'journal'));
create index if not exists acct_entries_date_idx on public.acct_entries (entry_date);

create table if not exists public.acct_lines (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.acct_entries(id) on delete cascade,
  account_code text not null references public.acct_accounts(code) on update cascade,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  memo text not null default '',
  check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0) and (debit > 0 or credit > 0))
);
create index if not exists acct_lines_entry_idx on public.acct_lines (entry_id);
create index if not exists acct_lines_account_idx on public.acct_lines (account_code);

-- ───────────────────────────── bank reconciliation ─────────────────────────────

-- key: the journal line's stable id (e.g. "pay:<ledger id>", "payout:<lot id>", "m:<line id>")
create table if not exists public.acct_cleared (
  key text primary key,
  account_code text not null,
  cleared_on date not null,
  reconciliation_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.acct_reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_code text not null references public.acct_accounts(code) on update cascade,
  statement_date date not null,
  statement_balance numeric(14,2) not null,
  cleared_balance numeric(14,2) not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── settings ─────────────────────────────

alter table public.office_settings add column if not exists acct_methods jsonb not null default
  '{"Bank transfer": "1020", "Cash": "1010", "Card link (Ziina)": "1030", "Card (website)": "1030", "Tabby": "1040", "Tamara": "1050", "Cash on delivery": "1060", "Other": "1900"}'::jsonb;
alter table public.office_settings add column if not exists acct_payout_default text not null default '1020';
alter table public.office_settings add column if not exists acct_lock_date date;

alter table public.lot_private add column if not exists payout_account text not null default '';

-- ───────────────────────────── posting (balanced or nothing) ─────────────────────────────

create or replace function public.acct_post(p_entry jsonb, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_date date := (p_entry->>'entry_date')::date;
  v_lock date;
  v_dr numeric := 0;
  v_cr numeric := 0;
  v_n int := 0;
  l jsonb;
  v_debit numeric;
  v_credit numeric;
  v_code text;
begin
  if v_date is null then raise exception 'acct: the date is missing'; end if;
  select acct_lock_date into v_lock from public.office_settings where id = 1;
  if v_lock is not null and v_date <= v_lock then
    raise exception 'acct: the books are closed up to %', to_char(v_lock, 'DD Mon YYYY');
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'acct: an entry needs at least two lines';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_debit := round(coalesce((l->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((l->>'credit')::numeric, 0), 2);
    v_code := l->>'account_code';
    if v_debit < 0 or v_credit < 0 or (v_debit > 0 and v_credit > 0) or (v_debit = 0 and v_credit = 0) then
      raise exception 'acct: each line is either a debit or a credit, more than 0';
    end if;
    if not exists (select 1 from public.acct_accounts where code = v_code and active) then
      raise exception 'acct: account % is not in the chart of accounts', coalesce(v_code, '?');
    end if;
    v_dr := v_dr + v_debit;
    v_cr := v_cr + v_credit;
    v_n := v_n + 1;
  end loop;
  if v_dr <> v_cr then raise exception 'acct: debits (%) and credits (%) must be equal', v_dr, v_cr; end if;

  insert into public.acct_entries (entry_date, kind, memo, payee, reference, created_by)
  values (
    v_date, coalesce(nullif(p_entry->>'kind', ''), 'journal'), left(coalesce(p_entry->>'memo', ''), 500),
    left(coalesce(p_entry->>'payee', ''), 160), left(coalesce(p_entry->>'reference', ''), 160), nullif(p_entry->>'created_by', '')::uuid
  )
  returning id into v_id;
  insert into public.acct_lines (entry_id, account_code, debit, credit, memo)
  select v_id, x->>'account_code', round(coalesce((x->>'debit')::numeric, 0), 2), round(coalesce((x->>'credit')::numeric, 0), 2), left(coalesce(x->>'memo', ''), 300)
  from jsonb_array_elements(p_lines) x;
  return v_id;
end $$;

-- Entries are never deleted: a mistake is voided (it stays on record, struck out) and entered again.
create or replace function public.acct_void(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_date date; v_lock date;
begin
  select entry_date into v_date from public.acct_entries where id = p_id;
  if v_date is null then raise exception 'acct: no such entry'; end if;
  select acct_lock_date into v_lock from public.office_settings where id = 1;
  if v_lock is not null and v_date <= v_lock then
    raise exception 'acct: the books are closed up to %', to_char(v_lock, 'DD Mon YYYY');
  end if;
  update public.acct_entries set void = true, void_reason = left(coalesce(p_reason, ''), 300) where id = p_id;
end $$;

revoke all on function public.acct_post(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.acct_void(uuid, text) from public, anon, authenticated;
grant execute on function public.acct_post(jsonb, jsonb) to service_role;
grant execute on function public.acct_void(uuid, text) to service_role;

-- ───────────────────────────── security ─────────────────────────────

-- Spelled out (not only in the loop) so Supabase's SQL editor can see RLS is on.
alter table public.acct_accounts enable row level security;
alter table public.acct_entries enable row level security;
alter table public.acct_lines enable row level security;
alter table public.acct_cleared enable row level security;
alter table public.acct_reconciliations enable row level security;

do $$
declare t text;
begin
  foreach t in array array['acct_accounts', 'acct_entries', 'acct_lines', 'acct_cleared', 'acct_reconciliations']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format('create policy %I on public.%I for select using (public.is_staff())', t || '_staff', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';

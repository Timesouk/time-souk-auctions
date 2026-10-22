-- The Time Souk · 0006: the back office (the auction workbook, inside the admin).
-- Run once in the Supabase SQL Editor, after 0005. Safe to run again. It only adds tables and columns:
-- the website, bidding and existing invoices keep working exactly as before.
--
-- What it adds
--   customers            buyers: Instagram winners and website bidders, with a buyer code (B0001)
--   sellers              consignors and own stock (TS), with their fee % and fixed fee
--   intake_items         every watch a seller hands over, grouped by consignment receipt (CR-0001)
--   lot_private          + the workbook's lot fields: seller, winner, hammer, exception, delivery, payout
--   invoice_adjustments  per invoice: overseas delivery fee, discount, extra charge, pickup, note
--   ledger               deposits, payments and refunds
--   sent_log, card_links what went out on WhatsApp, and every card payment link
--   office_settings      company, bank, fees and terms for invoices and statements
--   office_messages      the WhatsApp wording you changed (English and Arabic)
-- Every table is staff-only. Browsers never read or write them; the admin does, on the server.

-- ───────────────────────────── settings ─────────────────────────────

create table if not exists public.office_settings (
  id int primary key default 1 check (id = 1),
  trading_name text not null default 'The Time Souk',
  legal_name text not null default 'The TS for Online Selling',
  licence text not null default '',
  address text not null default 'Dubai, United Arab Emirates',
  phone text not null default '+971 50 696 9080',
  email text not null default '',
  instagram text not null default '@thetimesouk',
  website text not null default 'timesoukauctions.com',
  trn text not null default '',
  brand_name text not null default 'DXB Watch × The Time Souk',
  bank_name text not null default '',
  bank_account text not null default '',
  bank_iban text not null default '',
  bank_swift text not null default '',
  fee_pct numeric(6,3) not null default 7.5,
  fee_fixed numeric(10,2) not null default 0,
  fee_min numeric(10,2) not null default 0,
  vat_fee_pct numeric(5,2) not null default 0,
  vat_sales_pct numeric(5,2) not null default 0,
  hours_to_pay int not null default 48,
  pay_clock time not null default '21:00',
  uae_fee numeric(10,2) not null default 30,
  cod_fee numeric(10,2) not null default 10,
  card_fee_pct numeric(5,2) not null default 3,
  card_fee_methods text[] not null default '{Card link (Ziina)}',
  cash_alert numeric(12,2) not null default 55000,
  remind_gap_hours int not null default 12,
  lot_target int not null default 100,
  wa_lang text not null default 'both',
  wa_mode text not null default 'app',
  link_mode text not null default 'ask',
  inv_note text not null default 'No buyer''s premium: you pay the hammer price.',
  inv_terms text not null default '',
  seller_terms text not null default '',
  intake_terms text not null default '',
  slip_note text not null default 'Your invoice follows on WhatsApp. Thank you!',
  updated_at timestamptz not null default now()
);
insert into public.office_settings (id) values (1) on conflict (id) do nothing;

alter table public.office_settings drop constraint if exists office_settings_wa_lang_check;
alter table public.office_settings add constraint office_settings_wa_lang_check check (wa_lang in ('both', 'en', 'ar'));
alter table public.office_settings drop constraint if exists office_settings_wa_mode_check;
alter table public.office_settings add constraint office_settings_wa_mode_check check (wa_mode in ('app', 'web'));
alter table public.office_settings drop constraint if exists office_settings_link_mode_check;
alter table public.office_settings add constraint office_settings_link_mode_check check (link_mode in ('ask', 'always'));

-- Only the wording you change is stored; everything else uses the built-in English and Arabic.
create table if not exists public.office_messages (
  key text primary key,
  en text,
  ar text,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── people ─────────────────────────────

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  instagram text,
  full_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  area text not null default '',
  country text not null default '',
  delivery text not null default '',
  usual_pay text not null default '',
  id_checked boolean not null default false,
  flag text not null default 'OK',
  notes text not null default '',
  lang text not null default '',
  profile_id uuid unique references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_instagram_idx on public.customers (lower(instagram));
alter table public.customers drop constraint if exists customers_flag_check;
alter table public.customers add constraint customers_flag_check check (flag in ('OK', 'Watch', 'Blocked'));
alter table public.customers drop constraint if exists customers_delivery_check;
alter table public.customers add constraint customers_delivery_check check (delivery in ('', 'Courier', 'Pickup'));
alter table public.customers drop constraint if exists customers_lang_check;
alter table public.customers add constraint customers_lang_check check (lang in ('', 'both', 'en', 'ar'));

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default '',
  kind text not null default 'consignment',
  phone text not null default '',
  instagram text not null default '',
  email text not null default '',
  id_checked text not null default '',
  fee_pct numeric(6,3),
  fee_fixed numeric(10,2),
  bank text not null default '',
  iban text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sellers drop constraint if exists sellers_kind_check;
alter table public.sellers add constraint sellers_kind_check check (kind in ('consignment', 'own'));
insert into public.sellers (code, name, kind) values ('TS', 'The Time Souk (own stock)', 'own') on conflict (code) do nothing;

create table if not exists public.intake_items (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null,
  item_id text not null unique,
  position int not null default 0,
  received_on date,
  seller_id uuid references public.sellers(id) on delete restrict,
  brand text not null default '',
  model text not null default '',
  reference text not null default '',
  serial text not null default '',
  year text not null default '',
  box_papers text not null default '',
  condition text not null default '',
  notes text not null default '',
  reserve numeric(12,2),
  start_price numeric(12,2),
  fee_pct numeric(6,3),
  fee_fixed numeric(10,2),
  received_by text not null default '',
  returned_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intake_items_receipt_idx on public.intake_items (receipt_no, position);

-- ───────────────────────────── auctions and lots ─────────────────────────────

alter table public.auctions add column if not exists pay_clock time;
alter table public.auctions add column if not exists office_notes text not null default '';
alter table public.auctions add column if not exists lot_target int;

-- The workbook's lot columns. Staff-only, like the rest of lot_private (reserve, cost, consignor).
alter table public.lot_private add column if not exists seller_id uuid references public.sellers(id) on delete set null;
alter table public.lot_private add column if not exists intake_item_id uuid references public.intake_items(id) on delete set null;
alter table public.lot_private add column if not exists fee_fixed numeric(10,2);
alter table public.lot_private add column if not exists serial text not null default '';
alter table public.lot_private add column if not exists box_papers text not null default '';
alter table public.lot_private add column if not exists intake_date date;
alter table public.lot_private add column if not exists winner_customer_id uuid references public.customers(id) on delete set null;
alter table public.lot_private add column if not exists winner_text text not null default '';
alter table public.lot_private add column if not exists hammer numeric(12,2);
alter table public.lot_private add column if not exists underbidder text not null default '';
alter table public.lot_private add column if not exists underbid numeric(12,2);
alter table public.lot_private add column if not exists exception text;
alter table public.lot_private add column if not exists delivery_status text not null default '';
alter table public.lot_private add column if not exists dispatched_on date;
alter table public.lot_private add column if not exists courier text not null default '';
alter table public.lot_private add column if not exists seller_paid_on date;
alter table public.lot_private add column if not exists payout_ref text not null default '';
alter table public.lot_private add column if not exists office_notes text not null default '';
alter table public.lot_private add column if not exists tray int;
alter table public.lot_private add column if not exists slip_printed_at timestamptz;
alter table public.lot_private drop constraint if exists lot_private_exception_check;
alter table public.lot_private add constraint lot_private_exception_check
  check (exception is null or exception in ('Withdrawn', 'Buyer defaulted', 'Returned by buyer'));
create index if not exists lot_private_winner_idx on public.lot_private (winner_customer_id);
create index if not exists lot_private_seller_idx on public.lot_private (seller_id);
create index if not exists lot_private_intake_idx on public.lot_private (intake_item_id);

-- A wider seller fee (e.g. 12.5%) and fee percentages with decimals.
alter table public.lot_private alter column seller_fee type numeric(6,3);

-- ───────────────────────────── money ─────────────────────────────

-- One row per invoice number (TS002-B0044) that needs something extra.
create table if not exists public.invoice_adjustments (
  invoice_no text primary key,
  delivery text not null default '',
  pays_by text not null default '',
  delivery_fee numeric(12,2),
  discount numeric(12,2),
  extra numeric(12,2),
  extra_label text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.ledger (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  entry_date date not null default ((now() at time zone 'Asia/Dubai')::date),
  kind text not null,
  customer_id uuid references public.customers(id) on delete restrict,
  invoice_no text not null default '',
  method text not null default '',
  amount numeric(12,2) not null,
  reference text not null default '',
  received_by text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.ledger drop constraint if exists ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check check (kind in ('Deposit', 'Payment', 'Refund'));
alter table public.ledger drop constraint if exists ledger_amount_check;
alter table public.ledger add constraint ledger_amount_check check (amount > 0);
create index if not exists ledger_invoice_idx on public.ledger (invoice_no);
create index if not exists ledger_customer_idx on public.ledger (customer_id);

create table if not exists public.sent_log (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  ref text not null default '',
  name text not null default '',
  phone text not null default '',
  total numeric(12,2),
  balance numeric(12,2),
  file text not null default '',
  kind text not null default '',
  link text not null default '',
  sent_by uuid references public.profiles(id) on delete set null
);
create index if not exists sent_log_ref_idx on public.sent_log (ref, kind);

create table if not exists public.card_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null default 'Invoice',
  invoice_no text not null default '',
  lot_key text not null default '',
  customer_id uuid references public.customers(id) on delete set null,
  name text not null default '',
  amount numeric(12,2) not null default 0,
  fee numeric(12,2) not null default 0,
  card_amount numeric(12,2) not null default 0,
  expires_at timestamptz,
  ziina_id text unique,
  url text not null default '',
  status text not null default '',
  checked_at timestamptz,
  ledger_id uuid references public.ledger(id) on delete set null
);
create index if not exists card_links_invoice_idx on public.card_links (invoice_no);

-- Rows brought in from the workbook remember where they came from, so importing it again updates them instead of adding copies.
alter table public.ledger add column if not exists import_ref text;
create unique index if not exists ledger_import_ref_uq on public.ledger (import_ref);
alter table public.sent_log add column if not exists import_ref text;
create unique index if not exists sent_log_import_ref_uq on public.sent_log (import_ref);
alter table public.card_links add column if not exists import_ref text;
create unique index if not exists card_links_import_ref_uq on public.card_links (import_ref);

-- ───────────────────────────── security ─────────────────────────────

alter table public.office_settings enable row level security;
alter table public.office_messages enable row level security;
alter table public.customers enable row level security;
alter table public.sellers enable row level security;
alter table public.intake_items enable row level security;
alter table public.invoice_adjustments enable row level security;
alter table public.ledger enable row level security;
alter table public.sent_log enable row level security;
alter table public.card_links enable row level security;

do $$
declare t text;
begin
  foreach t in array array['office_settings', 'office_messages', 'customers', 'sellers', 'intake_items', 'invoice_adjustments', 'ledger', 'sent_log', 'card_links']
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

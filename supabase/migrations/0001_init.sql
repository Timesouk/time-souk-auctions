-- The Time Souk · weekly live watch auction
-- Run once in Supabase → SQL Editor (or `supabase db push`).
--
-- Design rules
--   * Every bid is checked and timed by the database, with the lot row locked,
--     so two bids can never cross and the timer is the same for everyone.
--   * Sudden death: a bid counts only if it reaches the database before the lot's ends_at.
--   * Reserves, consignor details, max bids and bidder contact details never reach browsers.
--   * Browsers can only read; all changes go through the functions below or the server (service role).

create extension if not exists pgcrypto;

-- ───────────────────────────── helpers ─────────────────────────────

create or replace function public.bid_increment(p int)
returns int language sql immutable as $$
  select case
    when p < 1000 then 50
    when p < 5000 then 100
    when p < 10000 then 250
    when p < 20000 then 500
    when p < 50000 then 1000
    when p < 100000 then 2500
    when p < 200000 then 5000
    when p < 500000 then 10000
    else 25000 end
$$;

-- Adds n working days (Monday to Friday; the UAE weekend is Saturday and Sunday).
create or replace function public.add_working_days(d date, n int)
returns date language plpgsql immutable as $$
declare r date := d; c int := 0;
begin
  while c < n loop
    r := r + 1;
    if extract(isodow from r) < 6 then c := c + 1; end if;
  end loop;
  return r;
end $$;

create or replace function public.norm_ig(h text)
returns text language sql immutable as $$
  select nullif(lower(regexp_replace(coalesce(h, ''), '[^A-Za-z0-9._]', '', 'g')), '')
$$;

-- ───────────────────────────── tables ─────────────────────────────

create table public.settings (
  id int primary key default 1 check (id = 1),
  seller_fee numeric(5,2) not null default 7.5,
  pay_days int not null default 3 check (pay_days between 1 and 30),
  timer_seconds int not null default 180 check (timer_seconds between 30 and 900),
  lot_target int not null default 100,
  whatsapp text not null default '',
  instagram text not null default '',
  contact_email text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.settings_private (
  id int primary key default 1 check (id = 1),
  bank_details text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings_private (id) values (1);

create sequence public.paddle_seq start 101;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  paddle int not null unique default nextval('public.paddle_seq'),
  full_name text not null default '',
  email text not null default '',
  phone text,
  phone_verified_at timestamptz,
  country text not null default '',
  instagram text,
  instagram_confirmed boolean not null default false,
  lang text not null default 'en' check (lang in ('en', 'ar')),
  role text not null default 'bidder' check (role in ('bidder', 'staff', 'admin')),
  suspended boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index profiles_phone_verified_uq on public.profiles (phone) where phone_verified_at is not null;
create unique index profiles_instagram_confirmed_uq on public.profiles (instagram) where instagram_confirmed;
create index profiles_instagram_idx on public.profiles (instagram);

create table public.profile_notes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  notes text not null default '',
  id_checked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  number int not null unique check (number > 0),
  sale_date date not null,
  prebid_opens_at timestamptz not null,
  live_starts_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  block_lot_id uuid,
  created_at timestamptz not null default now(),
  check (prebid_opens_at < live_starts_at)
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  lot_number int not null check (lot_number > 0),
  brand text not null,
  model text not null,
  reference text not null default '',
  year text not null default '',
  case_size text not null default '',
  case_material text not null default '',
  dial text not null default '',
  bracelet text not null default '',
  dial_colour text not null default 'black',
  bezel text not null default 'smooth',
  shape text not null default 'round',
  hands text not null default 'three',
  has_box boolean not null default true,
  has_papers boolean not null default true,
  condition text not null default 'Excellent',
  notes_en text not null default '',
  notes_ar text not null default '',
  estimate_low int not null check (estimate_low > 0),
  estimate_high int not null check (estimate_high >= estimate_low),
  start_price int not null check (start_price > 0),
  no_reserve boolean not null default false,
  reserve_met boolean not null default false,
  made_pure boolean not null default false,
  photos text[] not null default '{}',
  current_bid int,
  leader_paddle int,
  leader_via text,
  bid_count int not null default 0,
  ends_at timestamptz,
  relisted_from uuid references public.lots(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auction_id, lot_number)
);
create index lots_auction_idx on public.lots (auction_id, lot_number);

alter table public.auctions
  add constraint auctions_block_lot_fk foreign key (block_lot_id) references public.lots(id) on delete set null;

create table public.lot_private (
  lot_id uuid primary key references public.lots(id) on delete cascade,
  reserve int check (reserve is null or reserve > 0),
  source text not null default 'stock' check (source in ('stock', 'consign')),
  cost int,
  consignor_name text not null default '',
  consignor_phone text not null default '',
  consignor_email text not null default '',
  seller_fee numeric(5,2),
  leader_id uuid references public.profiles(id) on delete set null,
  leader_ig text,
  updated_at timestamptz not null default now()
);

create table public.bids (
  id bigint generated always as identity primary key,
  lot_id uuid not null references public.lots(id) on delete cascade,
  amount int not null check (amount > 0),
  bidder_id uuid references public.profiles(id) on delete set null,
  ig_handle text,
  paddle int,
  via text not null check (via in ('web', 'instagram', 'whatsapp', 'phone', 'in_person', 'max')),
  is_auto boolean not null default false,
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (bidder_id is not null or ig_handle is not null)
);
create index bids_lot_idx on public.bids (lot_id, id desc);
create index bids_bidder_idx on public.bids (bidder_id);

create table public.max_bids (
  lot_id uuid not null references public.lots(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount > 0),
  set_at timestamptz not null default now(),
  primary key (lot_id, bidder_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  lot_id uuid not null references public.lots(id) on delete restrict,
  auction_id uuid not null references public.auctions(id) on delete restrict,
  bidder_id uuid references public.profiles(id) on delete set null,
  ig_handle text,
  amount int not null check (amount > 0),
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'processing', 'paid', 'void')),
  method text check (method in ('card', 'tabby', 'tamara', 'bank', 'cash')),
  paid_at timestamptz,
  pay_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  notified_at timestamptz,
  notify_error text,
  reminded_at timestamptz,
  transfer_claimed_at timestamptz,
  payout_paid_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index invoices_lot_active_uq on public.invoices (lot_id) where status <> 'void';
create unique index invoices_number_active_uq on public.invoices (number) where status <> 'void';
create index invoices_auction_idx on public.invoices (auction_id);
create index invoices_bidder_idx on public.invoices (bidder_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  provider text not null check (provider in ('ziina', 'tabby', 'tamara', 'bank', 'cash')),
  provider_ref text,
  status text not null default 'created' check (status in ('created', 'authorized', 'paid', 'failed', 'cancelled')),
  amount int not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index payments_invoice_idx on public.payments (invoice_id);

create table public.consignments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null default '',
  brand text not null,
  model text not null,
  reference text not null default '',
  year text not null default '',
  box_papers text not null default '',
  condition text not null default '',
  price_in_mind int,
  notes text not null default '',
  lang text not null default 'en',
  status text not null default 'new' check (status in ('new', 'contacted', 'accepted', 'declined', 'listed')),
  lot_id uuid references public.lots(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.events (
  id bigint generated always as identity primary key,
  kind text not null,
  lot_id uuid references public.lots(id) on delete set null,
  actor uuid,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_lot_idx on public.events (lot_id, id desc);

-- ───────────────────────────── auth hooks ─────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, country, instagram, lang)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(m ->> 'full_name', ''), 120),
    left(coalesce(m ->> 'country', ''), 60),
    public.norm_ig(m ->> 'instagram'),
    case when m ->> 'lang' = 'ar' then 'ar' else 'en' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ───────────────────────────── access helpers ─────────────────────────────

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff', 'admin') and not suspended
  )
$$;

-- The database clock, so every browser counts down against the same time as the bidding engine.
create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now() $$;

create or replace function public.lot_is_closed(p_ends_at timestamptz)
returns boolean language sql stable as $$
  select p_ends_at is not null and now() >= p_ends_at
$$;

-- ───────────────────────────── bidding engine ─────────────────────────────

-- Applies one bid or max bid to a lot that the caller has already locked.
-- Max bids ("we bid for you") answer automatically, one step at a time, up to each bidder's limit.
-- A tie goes to whoever committed to that amount first.
create or replace function public._apply_bid(
  p_lot_id uuid,
  p_bidder uuid,
  p_ig text,
  p_paddle int,
  p_amount int,
  p_kind text,
  p_via text,
  p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lot public.lots%rowtype;
  v_priv public.lot_private%rowtype;
  v_now timestamptz := now();
  v_reserve int;
  v_price int;
  v_leader uuid;
  v_leader_ig text;
  v_leader_paddle int;
  v_leader_via text;
  v_lead_at timestamptz;
  v_min int;
  v_existing int;
  v_added int := 0;
  v_top record;
  v_sec record;
  v_opp int;
  v_new int;
  v_is_leader boolean;
begin
  select * into v_lot from public.lots where id = p_lot_id;
  insert into public.lot_private (lot_id) values (p_lot_id) on conflict (lot_id) do nothing;
  select * into v_priv from public.lot_private where lot_id = p_lot_id;

  v_reserve := case when v_lot.no_reserve or v_lot.made_pure then 0 else coalesce(v_priv.reserve, 0) end;
  v_price := v_lot.current_bid;
  v_leader := v_priv.leader_id;
  v_leader_ig := v_priv.leader_ig;
  v_leader_paddle := v_lot.leader_paddle;
  v_leader_via := v_lot.leader_via;
  select max(created_at) into v_lead_at from public.bids where lot_id = p_lot_id;
  v_min := case when v_price is null then v_lot.start_price else v_price + public.bid_increment(v_price) end;
  v_is_leader := v_price is not null and (
    (p_bidder is not null and p_bidder = v_leader) or
    (p_bidder is null and p_ig is not null and p_ig = v_leader_ig)
  );

  if p_amount is null or p_amount <= 0 or p_amount > 50000000 then
    raise exception 'invalid_amount';
  end if;

  if p_kind = 'max' then
    if p_bidder is null then raise exception 'max_needs_paddle'; end if;
    select amount into v_existing from public.max_bids where lot_id = p_lot_id and bidder_id = p_bidder;
    if v_existing is not null and p_amount <= v_existing then
      raise exception 'max_not_higher:%', v_existing;
    end if;
    if v_is_leader then
      if p_amount <= v_price then raise exception 'bid_too_low:%', v_price + 1; end if;
    elsif p_amount < v_min then
      raise exception 'bid_too_low:%', v_min;
    end if;
    insert into public.max_bids (lot_id, bidder_id, amount, set_at)
    values (p_lot_id, p_bidder, p_amount, v_now)
    on conflict (lot_id, bidder_id) do update set amount = excluded.amount, set_at = excluded.set_at;
  else
    if v_is_leader then raise exception 'already_leading'; end if;
    if p_amount < v_min then raise exception 'bid_too_low:%', v_min; end if;
    insert into public.bids (lot_id, amount, bidder_id, ig_handle, paddle, via, is_auto, entered_by)
    values (p_lot_id, p_amount, p_bidder, case when p_bidder is null then p_ig end, p_paddle, p_via, false, p_actor);
    v_added := v_added + 1;
    v_price := p_amount;
    v_leader := p_bidder;
    v_leader_ig := case when p_bidder is null then p_ig end;
    v_leader_paddle := p_paddle;
    v_leader_via := p_via;
    v_lead_at := v_now;
  end if;

  -- Resolve max bids in one pass.
  -- A max bid takes part if it beats the current price, or equals it and was set before the leading bid.
  select m.bidder_id, m.amount, m.set_at, p.paddle into v_top
  from public.max_bids m join public.profiles p on p.id = m.bidder_id
  where m.lot_id = p_lot_id and not p.suspended and (
    (v_leader is not null and m.bidder_id = v_leader and m.amount >= coalesce(v_price, 0)) or
    ((v_leader is null or m.bidder_id <> v_leader) and (
      (v_price is null and m.amount >= v_lot.start_price) or
      m.amount > v_price or
      (m.amount = v_price and m.set_at < v_lead_at)
    ))
  )
  order by m.amount desc, m.set_at asc
  limit 1;

  if found then
    select m.bidder_id, m.amount, m.set_at, p.paddle into v_sec
    from public.max_bids m join public.profiles p on p.id = m.bidder_id
    where m.lot_id = p_lot_id and m.bidder_id <> v_top.bidder_id and not p.suspended and (
      (v_leader is not null and m.bidder_id = v_leader and m.amount >= coalesce(v_price, 0)) or
      ((v_leader is null or m.bidder_id <> v_leader) and (
        (v_price is null and m.amount >= v_lot.start_price) or
        m.amount > v_price or
        (m.amount = v_price and m.set_at < v_lead_at)
      ))
    )
    order by m.amount desc, m.set_at asc
    limit 1;

    if v_leader is not null and v_top.bidder_id = v_leader then
      -- The leader's own max bid is strongest: answer the best challenger, if any.
      if v_sec.bidder_id is not null then
        if v_sec.amount > coalesce(v_price, 0) then
          insert into public.bids (lot_id, amount, bidder_id, paddle, via, is_auto)
          values (p_lot_id, v_sec.amount, v_sec.bidder_id, v_sec.paddle, 'max', true);
          v_added := v_added + 1;
        end if;
        v_new := case when v_sec.amount >= v_top.amount then v_top.amount
                      else least(v_top.amount, v_sec.amount + public.bid_increment(v_sec.amount)) end;
      else
        v_new := v_price;
      end if;
      if v_reserve > 0 and v_new < v_reserve and v_top.amount >= v_reserve then v_new := v_reserve; end if;
      if v_new > coalesce(v_price, 0) or v_sec.bidder_id is not null then
        insert into public.bids (lot_id, amount, bidder_id, paddle, via, is_auto)
        values (p_lot_id, v_new, v_top.bidder_id, v_top.paddle, 'max', true);
        v_added := v_added + 1;
        v_price := v_new;
        v_leader_via := 'max';
      end if;
    else
      -- A challenger's max bid is strongest: it takes the lead.
      v_opp := v_price;
      if v_sec.bidder_id is not null then
        if v_sec.amount > coalesce(v_price, 0) then
          insert into public.bids (lot_id, amount, bidder_id, paddle, via, is_auto)
          values (p_lot_id, v_sec.amount, v_sec.bidder_id, v_sec.paddle, 'max', true);
          v_added := v_added + 1;
        end if;
        v_opp := greatest(coalesce(v_price, 0), v_sec.amount);
      end if;
      if v_opp is null then
        v_new := v_lot.start_price;
      elsif v_opp >= v_top.amount then
        v_new := v_top.amount;
      else
        v_new := least(v_top.amount, v_opp + public.bid_increment(v_opp));
      end if;
      if v_reserve > 0 and v_new < v_reserve and v_top.amount >= v_reserve then v_new := v_reserve; end if;
      insert into public.bids (lot_id, amount, bidder_id, paddle, via, is_auto)
      values (p_lot_id, v_new, v_top.bidder_id, v_top.paddle, 'max', true);
      v_added := v_added + 1;
      v_price := v_new;
      v_leader := v_top.bidder_id;
      v_leader_ig := null;
      v_leader_paddle := v_top.paddle;
      v_leader_via := 'max';
    end if;
  end if;

  update public.lots set
    current_bid = v_price,
    leader_paddle = v_leader_paddle,
    leader_via = v_leader_via,
    bid_count = bid_count + v_added,
    reserve_met = reserve_met or (v_reserve > 0 and v_price is not null and v_price >= v_reserve),
    updated_at = v_now
  where id = p_lot_id
  returning * into v_lot;

  update public.lot_private set leader_id = v_leader, leader_ig = v_leader_ig, updated_at = v_now
  where lot_id = p_lot_id;

  return jsonb_build_object(
    'ok', true,
    'price', v_lot.current_bid,
    'leader_paddle', v_lot.leader_paddle,
    'bid_count', v_lot.bid_count,
    'pure', v_lot.no_reserve or v_lot.reserve_met or v_lot.made_pure,
    'leading', (p_bidder is not null and v_leader = p_bidder) or (p_bidder is null and p_ig is not null and v_leader_ig = p_ig),
    'added', v_added
  );
end $$;

-- Bids from the website. The caller must be signed in, verified and not suspended.
create or replace function public.place_bid(p_lot_id uuid, p_amount int, p_kind text default 'bid')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles%rowtype;
  v_email_ok boolean;
  v_lot public.lots%rowtype;
  v_auc public.auctions%rowtype;
begin
  if v_uid is null then raise exception 'sign_in_required'; end if;
  if p_kind not in ('bid', 'max') then raise exception 'invalid_kind'; end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found then raise exception 'sign_in_required'; end if;
  if v_prof.suspended then raise exception 'account_suspended'; end if;
  select email_confirmed_at is not null into v_email_ok from auth.users where id = v_uid;
  if not coalesce(v_email_ok, false) or v_prof.phone_verified_at is null or v_prof.terms_accepted_at is null then
    raise exception 'verification_required';
  end if;

  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  select * into v_auc from public.auctions where id = v_lot.auction_id;
  if v_auc.status <> 'published' or now() < v_auc.prebid_opens_at then raise exception 'bidding_not_open'; end if;
  if public.lot_is_closed(v_lot.ends_at) then raise exception 'lot_closed'; end if;

  return public._apply_bid(p_lot_id, v_uid, null, v_prof.paddle, p_amount, p_kind, case when p_kind = 'max' then 'max' else 'web' end, null);
end $$;

-- Bids typed in by staff: Instagram comments (@handle), WhatsApp, phone or in person (paddle number).
create or replace function public.staff_record_bid(
  p_lot_id uuid,
  p_amount int,
  p_paddle int default null,
  p_ig text default null,
  p_via text default 'instagram',
  p_kind text default 'bid'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_lot public.lots%rowtype;
  v_auc public.auctions%rowtype;
  v_prof public.profiles%rowtype;
  v_ig text := public.norm_ig(p_ig);
  v_res jsonb;
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  if p_via not in ('instagram', 'whatsapp', 'phone', 'in_person', 'web') then raise exception 'invalid_via'; end if;
  if p_kind not in ('bid', 'max') then raise exception 'invalid_kind'; end if;

  if p_paddle is not null then
    select * into v_prof from public.profiles where paddle = p_paddle;
    if not found then raise exception 'unknown_paddle:%', p_paddle; end if;
  elsif v_ig is not null then
    select * into v_prof from public.profiles where instagram = v_ig and instagram_confirmed;
  else
    raise exception 'bidder_required';
  end if;
  if v_prof.id is not null and v_prof.suspended then raise exception 'account_suspended'; end if;
  if p_kind = 'max' and v_prof.id is null then raise exception 'max_needs_paddle'; end if;

  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  select * into v_auc from public.auctions where id = v_lot.auction_id;
  if v_auc.status = 'closed' then raise exception 'auction_closed'; end if;
  if public.lot_is_closed(v_lot.ends_at) then raise exception 'lot_closed'; end if;

  v_res := public._apply_bid(
    p_lot_id, v_prof.id, case when v_prof.id is null then v_ig end, v_prof.paddle,
    p_amount, p_kind, case when p_kind = 'max' then 'max' else p_via end, v_actor
  );
  insert into public.events (kind, lot_id, actor, data)
  values ('staff_bid', p_lot_id, v_actor, jsonb_build_object('amount', p_amount, 'paddle', v_prof.paddle, 'ig', v_ig, 'via', p_via, 'kind', p_kind));
  return v_res;
end $$;

-- ───────────────────────────── live lot controls ─────────────────────────────

create or replace function public.staff_lot_action(p_lot_id uuid, p_action text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_lot public.lots%rowtype;
  v_auc public.auctions%rowtype;
  v_timer int;
  v_live_other uuid;
  v_inv public.invoices%rowtype;
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  select * into v_auc from public.auctions where id = v_lot.auction_id for update;
  select timer_seconds into v_timer from public.settings where id = 1;

  select id into v_live_other from public.lots
  where auction_id = v_lot.auction_id and id <> p_lot_id and ends_at is not null and ends_at > now()
  limit 1;

  if p_action = 'block' then
    if v_auc.status <> 'published' then raise exception 'auction_not_published'; end if;
    if v_live_other is not null then raise exception 'another_lot_live'; end if;
    if public.lot_is_closed(v_lot.ends_at) then raise exception 'lot_closed'; end if;
    update public.auctions set block_lot_id = p_lot_id where id = v_auc.id;

  elsif p_action = 'start' then
    if v_auc.block_lot_id is distinct from p_lot_id then raise exception 'not_on_block'; end if;
    if v_lot.ends_at is not null then raise exception 'timer_already_used'; end if;
    update public.lots set ends_at = now() + make_interval(secs => v_timer), updated_at = now() where id = p_lot_id;

  elsif p_action = 'restart' then
    if v_lot.ends_at is null or v_lot.ends_at <= now() then raise exception 'timer_not_running'; end if;
    update public.lots set ends_at = now() + make_interval(secs => v_timer), updated_at = now() where id = p_lot_id;

  elsif p_action = 'stop' then
    if v_lot.ends_at is null or v_lot.ends_at <= now() then raise exception 'timer_not_running'; end if;
    update public.lots set ends_at = null, updated_at = now() where id = p_lot_id;

  elsif p_action = 'hammer' then
    if public.lot_is_closed(v_lot.ends_at) then raise exception 'lot_closed'; end if;
    update public.lots set ends_at = now(), updated_at = now() where id = p_lot_id;

  elsif p_action = 'reopen' then
    if not public.lot_is_closed(v_lot.ends_at) then raise exception 'lot_open'; end if;
    if v_live_other is not null then raise exception 'another_lot_live'; end if;
    select * into v_inv from public.invoices where lot_id = p_lot_id and status <> 'void';
    if found then
      if v_inv.status in ('paid', 'processing') then raise exception 'invoice_paid'; end if;
      update public.invoices set status = 'void', void_reason = 'Lot reopened', updated_at = now() where id = v_inv.id;
    end if;
    update public.lots set ends_at = null, updated_at = now() where id = p_lot_id;
    update public.auctions set block_lot_id = p_lot_id where id = v_auc.id;

  elsif p_action = 'pure' then
    if public.lot_is_closed(v_lot.ends_at) then raise exception 'lot_closed'; end if;
    update public.lots set made_pure = true, updated_at = now() where id = p_lot_id;

  elsif p_action = 'clear' then
    if v_live_other is not null or (v_lot.ends_at is not null and v_lot.ends_at > now()) then raise exception 'lot_live'; end if;
    update public.auctions set block_lot_id = null where id = v_auc.id;

  else
    raise exception 'invalid_action';
  end if;

  insert into public.events (kind, lot_id, actor, data)
  values ('lot_' || p_action, p_lot_id, v_actor, jsonb_build_object('ends_at', (select ends_at from public.lots where id = p_lot_id)));

  return (select jsonb_build_object('ok', true, 'ends_at', l.ends_at, 'block_lot_id', a.block_lot_id)
          from public.lots l join public.auctions a on a.id = l.auction_id where l.id = p_lot_id);
end $$;

-- ───────────────────────────── invoices ─────────────────────────────

-- Creates the winner's invoice once a lot's timer has ended. Safe to call many times.
create or replace function public.finalize_lot(p_lot_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lot public.lots%rowtype;
  v_auc public.auctions%rowtype;
  v_priv public.lot_private%rowtype;
  v_pay_days int;
  v_id uuid;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'staff_only'; end if;
  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found or not public.lot_is_closed(v_lot.ends_at) then return null; end if;
  if v_lot.current_bid is null or not (v_lot.no_reserve or v_lot.reserve_met or v_lot.made_pure) then return null; end if;
  select id into v_id from public.invoices where lot_id = p_lot_id and status <> 'void';
  if found then return v_id; end if;

  select * into v_auc from public.auctions where id = v_lot.auction_id;
  select * into v_priv from public.lot_private where lot_id = p_lot_id;
  select pay_days into v_pay_days from public.settings where id = 1;

  insert into public.invoices (number, lot_id, auction_id, bidder_id, ig_handle, amount, due_date)
  values (
    'TS-' || lpad(v_auc.number::text, 3, '0') || '-' || lpad(v_lot.lot_number::text, 3, '0'),
    p_lot_id, v_auc.id, v_priv.leader_id, v_priv.leader_ig, v_lot.current_bid,
    public.add_working_days((v_lot.ends_at at time zone 'Asia/Dubai')::date, coalesce(v_pay_days, 3))
  )
  returning id into v_id;

  insert into public.events (kind, lot_id, data) values ('invoice_created', p_lot_id, jsonb_build_object('invoice_id', v_id));
  return v_id;
end $$;

create or replace function public.finalize_due_lots()
returns setof uuid
language plpgsql security definer set search_path = public as $$
declare r record; v uuid;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'staff_only'; end if;
  for r in
    select l.id from public.lots l
    where l.ends_at is not null and l.ends_at <= now() and l.current_bid is not null
      and (l.no_reserve or l.reserve_met or l.made_pure)
      and not exists (select 1 from public.invoices i where i.lot_id = l.id and i.status <> 'void')
  loop
    v := public.finalize_lot(r.id);
    if v is not null then return next v; end if;
  end loop;
end $$;

-- ───────────────────────────── reads for everyone ─────────────────────────────

-- Public bid history: amounts, paddle numbers and channel only. Never names or contact details.
create or replace function public.lot_bid_history(p_lot_id uuid, p_limit int default 50)
returns table (amount int, paddle int, via text, is_auto boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.amount, b.paddle, b.via, b.is_auto, b.created_at
  from public.bids b
  join public.lots l on l.id = b.lot_id
  join public.auctions a on a.id = l.auction_id
  where b.lot_id = p_lot_id and (a.status <> 'draft' or public.is_staff())
  order by b.id desc
  limit least(greatest(p_limit, 1), 200)
$$;

-- What the signed-in bidder needs: their paddle, verification state and max bids.
create or replace function public.my_status()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'paddle', p.paddle,
      'full_name', p.full_name,
      'email', p.email,
      'email_verified', u.email_confirmed_at is not null,
      'phone', p.phone,
      'phone_verified', p.phone_verified_at is not null,
      'terms_accepted', p.terms_accepted_at is not null,
      'country', p.country,
      'instagram', p.instagram,
      'lang', p.lang,
      'role', p.role,
      'suspended', p.suspended,
      'verified', u.email_confirmed_at is not null and p.phone_verified_at is not null and p.terms_accepted_at is not null and not p.suspended
    )
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid()
  ) end
$$;

create or replace function public.complete_profile(p_full_name text, p_country text, p_instagram text, p_lang text, p_accept_terms boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ig text := public.norm_ig(p_instagram);
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'name_required'; end if;
  if not coalesce(p_accept_terms, false) then raise exception 'terms_required'; end if;
  if v_ig is not null and exists (select 1 from public.profiles where instagram = v_ig and instagram_confirmed and id <> auth.uid()) then
    raise exception 'instagram_taken';
  end if;
  update public.profiles set
    full_name = left(trim(p_full_name), 120),
    country = left(coalesce(p_country, ''), 60),
    instagram = case when instagram_confirmed and instagram is not distinct from v_ig then instagram else v_ig end,
    instagram_confirmed = instagram_confirmed and instagram is not distinct from v_ig,
    lang = case when p_lang = 'ar' then 'ar' else 'en' end,
    terms_accepted_at = coalesce(terms_accepted_at, now())
  where id = auth.uid();
  return public.my_status();
end $$;

-- ───────────────────────────── row-level security ─────────────────────────────

alter table public.settings enable row level security;
alter table public.settings_private enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_notes enable row level security;
alter table public.auctions enable row level security;
alter table public.lots enable row level security;
alter table public.lot_private enable row level security;
alter table public.bids enable row level security;
alter table public.max_bids enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.consignments enable row level security;
alter table public.events enable row level security;

create policy settings_read on public.settings for select using (true);
create policy settings_private_staff on public.settings_private for select using (public.is_staff());
create policy profiles_own on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profile_notes_staff on public.profile_notes for select using (public.is_staff());
create policy auctions_read on public.auctions for select using (status <> 'draft' or public.is_staff());
create policy lots_read on public.lots for select using (
  public.is_staff() or exists (select 1 from public.auctions a where a.id = auction_id and a.status <> 'draft')
);
create policy lot_private_staff on public.lot_private for select using (public.is_staff());
create policy bids_own on public.bids for select using (bidder_id = auth.uid() or public.is_staff());
create policy max_bids_own on public.max_bids for select using (bidder_id = auth.uid() or public.is_staff());
create policy invoices_own on public.invoices for select using (bidder_id = auth.uid() or public.is_staff());
create policy payments_staff on public.payments for select using (public.is_staff());
create policy consignments_staff on public.consignments for select using (public.is_staff());
create policy events_staff on public.events for select using (public.is_staff());

-- Explicit privileges, so nothing depends on platform defaults. Row-level security above decides which rows each role sees.
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.bid_increment(int) to anon, authenticated;

-- Browsers never write tables directly; they call the functions above.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on function public._apply_bid(uuid, uuid, text, int, int, text, text, uuid) from public, anon, authenticated;
revoke all on function public.finalize_due_lots() from public, anon, authenticated;
revoke all on function public.finalize_lot(uuid) from public, anon;
grant execute on function public.place_bid(uuid, int, text) to authenticated;
grant execute on function public.staff_record_bid(uuid, int, int, text, text, text) to authenticated;
grant execute on function public.staff_lot_action(uuid, text) to authenticated;
grant execute on function public.finalize_lot(uuid) to authenticated;
grant execute on function public.complete_profile(text, text, text, text, boolean) to authenticated;
grant execute on function public.my_status() to anon, authenticated;
grant execute on function public.server_now() to anon, authenticated;
grant execute on function public.lot_bid_history(uuid, int) to anon, authenticated;

-- ───────────────────────────── realtime and photos ─────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.lots, public.auctions;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('lot-photos', 'lot-photos', true)
    on conflict (id) do nothing;
  end if;
end $$;

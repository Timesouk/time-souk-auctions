0003_any_amount_cod_address.sql-- The Time Souk · 0003: bid any amount, cash on delivery, delivery addresses.
-- Run once in the Supabase SQL Editor, after 0001 and 0002. Safe to run again.

-- Delivery address on the bidder's profile (filled at sign-up, in the account page, or at checkout).
alter table public.profiles add column if not exists address text not null default '';
alter table public.profiles add column if not exists city text not null default '';

-- Cash on delivery: the buyer chooses it on the payment page; the fee is added to what they pay.
alter table public.settings add column if not exists cod_fee int not null default 10;
alter table public.settings drop constraint if exists settings_cod_fee_check;
alter table public.settings add constraint settings_cod_fee_check check (cod_fee between 0 and 1000);

alter table public.invoices add column if not exists cod_fee int not null default 0;
alter table public.invoices add column if not exists cod_requested_at timestamptz;
alter table public.invoices add column if not exists delivery_address text not null default '';
alter table public.invoices add column if not exists delivery_city text not null default '';
alter table public.invoices drop constraint if exists invoices_method_check;
alter table public.invoices add constraint invoices_method_check check (method in ('card', 'tabby', 'tamara', 'bank', 'cash', 'cod'));
alter table public.invoices drop constraint if exists invoices_cod_fee_check;
alter table public.invoices add constraint invoices_cod_fee_check check (cod_fee >= 0);

-- Bidding: any amount above the current bid.
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
  -- Any amount above the current bid is allowed. Max bids still answer one bid step at a time.
  v_min := case when v_price is null then v_lot.start_price else v_price + 1 end;
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

-- The signed-in bidder's own details, now with their delivery address.
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
      'address', p.address,
      'city', p.city,
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

-- Sign-up details and account edits, now with an optional delivery address.
drop function if exists public.complete_profile(text, text, text, text, boolean);

create or replace function public.complete_profile(
  p_full_name text, p_country text, p_instagram text, p_lang text, p_accept_terms boolean,
  p_address text default null, p_city text default null
)
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
    address = case when p_address is null then address else left(trim(p_address), 500) end,
    city = case when p_city is null then city else left(trim(p_city), 80) end,
    instagram = case when instagram_confirmed and instagram is not distinct from v_ig then instagram else v_ig end,
    instagram_confirmed = instagram_confirmed and instagram is not distinct from v_ig,
    lang = case when p_lang = 'ar' then 'ar' else 'en' end,
    terms_accepted_at = coalesce(terms_accepted_at, now())
  where id = auth.uid();
  return public.my_status();
end $$;

-- Invoices are now sent by staff with "Send invoice" (never automatically when the timer ends).
-- The payment deadline counts from the day the invoice is sent, so a late send never shortens it.
create or replace function public.finalize_lot(p_lot_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lot public.lots%rowtype;
  v_auc public.auctions%rowtype;
  v_priv public.lot_private%rowtype;
  v_pay_days int;
  v_id uuid;
  v_from date;
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
  v_from := greatest((v_lot.ends_at at time zone 'Asia/Dubai')::date, (now() at time zone 'Asia/Dubai')::date);

  insert into public.invoices (number, lot_id, auction_id, bidder_id, ig_handle, amount, due_date, delivery_address, delivery_city)
  select
    'TS-' || lpad(v_auc.number::text, 3, '0') || '-' || lpad(v_lot.lot_number::text, 3, '0'),
    p_lot_id, v_auc.id, v_priv.leader_id, v_priv.leader_ig, v_lot.current_bid,
    public.add_working_days(v_from, coalesce(v_pay_days, 3)),
    coalesce(p.address, ''), coalesce(p.city, '')
  from (select 1) one
  left join public.profiles p on p.id = v_priv.leader_id
  returning id into v_id;

  insert into public.events (kind, lot_id, data) values ('invoice_created', p_lot_id, jsonb_build_object('invoice_id', v_id));
  return v_id;
end $$;

revoke all on function public.finalize_lot(uuid) from public, anon;
grant execute on function public.finalize_lot(uuid) to authenticated, service_role;
revoke all on function public.finalize_due_lots() from public, anon, authenticated;

revoke all on function public.complete_profile(text, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.complete_profile(text, text, text, text, boolean, text, text) to authenticated, service_role;
revoke all on function public._apply_bid(uuid, uuid, text, int, int, text, text, uuid) from public, anon, authenticated;
grant execute on function public._apply_bid(uuid, uuid, text, int, int, text, text, uuid) to service_role;
grant execute on function public.my_status() to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

notify pgrst, 'reload schema';

-- The Time Souk · 0005: optional estimates, lots that start at AED 0, staff logins, one admin.
-- Run once in the Supabase SQL Editor, after 0004. Safe to run again.

-- Estimates: leave them empty if you'd rather not show them. Starting bid: 0 or more.
alter table public.lots alter column estimate_low drop not null;
alter table public.lots alter column estimate_high drop not null;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.lots'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%estimate%' or pg_get_constraintdef(oid) ilike '%start_price%')
  loop
    execute format('alter table public.lots drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.lots add constraint lots_estimate_low_check check (estimate_low is null or estimate_low > 0);
alter table public.lots add constraint lots_estimate_high_check
  check (estimate_high is null or (estimate_high > 0 and (estimate_low is null or estimate_high >= estimate_low)));
alter table public.lots add constraint lots_start_price_check check (start_price >= 0);

-- Bidding: a lot that starts at 0 opens at any amount from AED 1; a lone max bid holds it at AED 1.
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
  -- The first bid can be any amount from the starting bid (from AED 1 when the lot starts at 0).
  v_min := case when v_price is null then greatest(v_lot.start_price, 1) else v_price + 1 end;
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
        v_new := greatest(v_lot.start_price, 1);
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

-- Staff accounts the admin creates: they sign in to the admin with a staff ID and a password.
alter table public.profiles add column if not exists staff_login text;
create unique index if not exists profiles_staff_login_uq on public.profiles (staff_login) where staff_login is not null;

-- Only one admin. (Skipped if there is more than one today: change the others to staff first, then run this again.)
do $$
begin
  if (select count(*) from public.profiles where role = 'admin') <= 1 then
    create unique index if not exists profiles_one_admin_uq on public.profiles ((true)) where role = 'admin';
  else
    raise notice 'More than one admin: change the others to staff in the admin (Staff page), then run this script again.';
  end if;
end $$;

revoke all on function public._apply_bid(uuid, uuid, text, int, int, text, text, uuid) from public, anon, authenticated;
grant execute on function public._apply_bid(uuid, uuid, text, int, int, text, text, uuid) to service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

notify pgrst, 'reload schema';

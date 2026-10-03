-- The Time Souk · 0002: change the lot timer per auction and per lot.
-- Run once in the Supabase SQL Editor, after 0001_init.sql. Safe to run again.
--
-- Which timer a lot gets when staff press Start:
--   the lot's own timer (set from the live console)  →  else the auction's timer  →  else the default in Settings.

alter table public.auctions add column if not exists timer_seconds int;
alter table public.lots add column if not exists timer_seconds int;

alter table public.settings drop constraint if exists settings_timer_seconds_check;
alter table public.settings add constraint settings_timer_seconds_check check (timer_seconds between 10 and 3600);
alter table public.auctions drop constraint if exists auctions_timer_seconds_check;
alter table public.auctions add constraint auctions_timer_seconds_check check (timer_seconds is null or timer_seconds between 10 and 3600);
alter table public.lots drop constraint if exists lots_timer_seconds_check;
alter table public.lots add constraint lots_timer_seconds_check check (timer_seconds is null or timer_seconds between 10 and 3600);

-- Live controls now take an optional timer length (seconds) for this lot.
drop function if exists public.staff_lot_action(uuid, text);

create or replace function public.staff_lot_action(p_lot_id uuid, p_action text, p_seconds int default null)
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
  if p_seconds is not null and (p_seconds < 10 or p_seconds > 3600) then raise exception 'invalid_timer'; end if;
  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found then raise exception 'lot_not_found'; end if;
  select * into v_auc from public.auctions where id = v_lot.auction_id for update;
  v_timer := coalesce(p_seconds, v_lot.timer_seconds, v_auc.timer_seconds, (select timer_seconds from public.settings where id = 1), 180);

  select id into v_live_other from public.lots
  where auction_id = v_lot.auction_id and id <> p_lot_id and ends_at is not null and ends_at > now()
  limit 1;

  if p_action = 'block' then
    if v_auc.status <> 'published' then raise exception 'auction_not_published'; end if;
    if v_live_other is not null then raise exception 'another_lot_live'; end if;
    if public.lot_is_closed(v_lot.ends_at) then raise exception 'lot_closed'; end if;
    update public.auctions set block_lot_id = p_lot_id where id = v_auc.id;
    if p_seconds is not null then update public.lots set timer_seconds = p_seconds, updated_at = now() where id = p_lot_id; end if;

  elsif p_action = 'set_timer' then
    -- Sudden death: a running timer is never lengthened or shortened. Stop or Restart instead.
    if v_lot.ends_at is not null and v_lot.ends_at > now() then raise exception 'timer_running'; end if;
    update public.lots set timer_seconds = p_seconds, updated_at = now() where id = p_lot_id;

  elsif p_action = 'start' then
    if v_auc.block_lot_id is distinct from p_lot_id then raise exception 'not_on_block'; end if;
    if v_lot.ends_at is not null then raise exception 'timer_already_used'; end if;
    update public.lots set ends_at = now() + make_interval(secs => v_timer),
      timer_seconds = coalesce(p_seconds, timer_seconds), updated_at = now() where id = p_lot_id;

  elsif p_action = 'restart' then
    if v_lot.ends_at is null or v_lot.ends_at <= now() then raise exception 'timer_not_running'; end if;
    update public.lots set ends_at = now() + make_interval(secs => v_timer),
      timer_seconds = coalesce(p_seconds, timer_seconds), updated_at = now() where id = p_lot_id;

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
  values ('lot_' || p_action, p_lot_id, v_actor, jsonb_build_object(
    'ends_at', (select ends_at from public.lots where id = p_lot_id),
    'timer_seconds', case when p_action in ('start', 'restart') then v_timer else p_seconds end));

  return (select jsonb_build_object('ok', true, 'ends_at', l.ends_at, 'block_lot_id', a.block_lot_id, 'timer_seconds', l.timer_seconds)
          from public.lots l join public.auctions a on a.id = l.auction_id where l.id = p_lot_id);
end $$;

revoke all on function public.staff_lot_action(uuid, text, int) from public, anon;
grant execute on function public.staff_lot_action(uuid, text, int) to authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

-- Tell the API about the new columns and function straight away.
notify pgrst, 'reload schema';

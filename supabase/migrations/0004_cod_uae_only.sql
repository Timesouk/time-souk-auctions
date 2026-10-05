-- The Time Souk · 0004: cash on delivery only for deliveries within the UAE.
-- Run once in the Supabase SQL Editor, after 0003. Safe to run again.

-- The delivery country the buyer picks on the payment page (blank until they choose).
alter table public.invoices add column if not exists delivery_country text not null default '';

-- Cash on delivery can only be on an invoice delivered in the UAE.
alter table public.invoices drop constraint if exists invoices_cod_uae_check;
alter table public.invoices add constraint invoices_cod_uae_check
  check (cod_requested_at is null or delivery_country = 'United Arab Emirates') not valid;

grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

notify pgrst, 'reload schema';

-- Several admins: lets the admin give other staff full admin access (Staff page › Make admin). Run after 0010
-- (Supabase › SQL Editor › New query › paste › Run). Safe to run again: it only removes the "one admin" rule;
-- no accounts or data change.

drop index if exists public.profiles_one_admin_uq;

notify pgrst, 'reload schema';

-- =============================================================================
-- Presence - Supabase Database Schema
-- Open Supabase dashboard -> SQL Editor -> New query
-- Paste the entire contents of this file and click Run.
-- =============================================================================

-- 1. profiles
-- Extends auth.users. A row is created automatically via trigger on signup.

create table if not exists public.profiles (
  id                        uuid primary key references auth.users(id) on delete cascade,
  email                     text not null,
  is_subscribed             boolean not null default false,
  subscription_expires_at   timestamptz,
  lifetime_connections      integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. routines
-- One row per user storing their block time, frequency, and blocked app list.

create table if not exists public.routines (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.profiles(id) on delete cascade,
  block_time       time not null default '20:00:00',
  frequency        text not null default 'daily'
                     check (frequency in ('daily', '5x', 'weekends')),
  blocked_apps     text[] not null default '{}',
  trusted_contacts text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Migration for existing databases: add trusted_contacts if the table already exists
-- Run this manually in the Supabase SQL Editor if the table was created before this column was added:
-- alter table public.routines add column if not exists trusted_contacts text[] not null default '{}';

alter table public.routines enable row level security;

create policy "routines: owner all"
  on public.routines for all
  using (auth.uid() = user_id);

-- 3. connection_proofs
-- One row per successful (or bypassed) OCR verification.

create table if not exists public.connection_proofs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  verified_at  timestamptz not null default now(),
  was_bypass   boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.connection_proofs enable row level security;

create policy "proofs: owner all"
  on public.connection_proofs for all
  using (auth.uid() = user_id);

-- 4. Auto-create profile row when a user signs up

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. updated_at auto-stamp for profiles and routines

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_routines_updated_at on public.routines;
create trigger set_routines_updated_at
  before update on public.routines
  for each row execute procedure public.set_updated_at();

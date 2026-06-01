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
  current_streak            integer not null default 0,
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
-- Trusted contacts are now stored in their own table (public.contacts) — see §3.

create table if not exists public.routines (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.profiles(id) on delete cascade,
  block_time       time not null default '20:00:00',
  frequency        text not null default 'daily'
                     check (frequency in ('daily', '5x', 'weekends')),
  blocked_apps     text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.routines enable row level security;

create policy "routines: owner all"
  on public.routines for all
  using (auth.uid() = user_id);

-- 3. contacts
-- One row per trusted contact the user has added. Q1/Q2 are required at the
-- UI level for theme generation but kept nullable in the DB so we can write a
-- name-only row before answers are filled in (Phase 1) and so users can blank
-- a field while editing without violating a constraint.

create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  how_known     text,                                  -- Q1: how you know them
  cares_about   text,                                  -- Q2: what they care about right now
  appreciate    text,                                  -- Q3: what you appreciate (optional)
  want_to_say   text,                                  -- Q4: what you've been meaning to say (optional)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists contacts_user_id_idx on public.contacts(user_id);

alter table public.contacts enable row level security;

create policy "contacts: owner all"
  on public.contacts for all
  using (auth.uid() = user_id);

-- 4. contact_themes
-- Generated personalised message ideas per contact. used_at advances when an
-- OCR-verified connection thematically matches the theme (Phase 4). Themes
-- with used_at IS NULL drive the rotation + warm-up notification copy.

create table if not exists public.contact_themes (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  theme_text   text not null,
  keywords     text[] not null default '{}',          -- short lowercase tokens for local OCR match
  used_at      timestamptz,                            -- null = available for rotation
  created_at   timestamptz not null default now()
);

create index if not exists contact_themes_contact_id_idx
  on public.contact_themes(contact_id);

-- Partial index for the rotation pick query (unused themes per user)
create index if not exists contact_themes_user_unused_idx
  on public.contact_themes(user_id)
  where used_at is null;

alter table public.contact_themes enable row level security;

create policy "contact_themes: owner all"
  on public.contact_themes for all
  using (auth.uid() = user_id);

-- 5. connection_proofs
-- One row per successful (or bypassed) OCR verification. Phase 1 adds the
-- contact_id and theme_id columns; both are nullable so a bypass or legacy
-- proof without a matched theme still records cleanly. Phase 4 starts
-- populating them.

create table if not exists public.connection_proofs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete set null,
  theme_id     uuid references public.contact_themes(id) on delete set null,
  verified_at  timestamptz not null default now(),
  was_bypass   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists connection_proofs_user_id_idx
  on public.connection_proofs(user_id);

alter table public.connection_proofs enable row level security;

create policy "proofs: owner all"
  on public.connection_proofs for all
  using (auth.uid() = user_id);

-- 6. Auto-create profile row when a user signs up

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

-- 7. updated_at auto-stamp for profiles, routines, contacts

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

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
  before update on public.contacts
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- Migration for existing dev databases (Phase 1 — contacts + themes)
-- Run these statements in order if you already have the older schema deployed.
-- They are idempotent; safe to re-run.
-- =============================================================================
--
-- create table if not exists public.contacts (
--   id            uuid primary key default gen_random_uuid(),
--   user_id       uuid not null references public.profiles(id) on delete cascade,
--   name          text not null,
--   how_known     text,
--   cares_about   text,
--   appreciate    text,
--   want_to_say   text,
--   created_at    timestamptz not null default now(),
--   updated_at    timestamptz not null default now()
-- );
-- create index if not exists contacts_user_id_idx on public.contacts(user_id);
-- alter table public.contacts enable row level security;
-- create policy "contacts: owner all" on public.contacts for all using (auth.uid() = user_id);
--
-- create table if not exists public.contact_themes (
--   id           uuid primary key default gen_random_uuid(),
--   contact_id   uuid not null references public.contacts(id) on delete cascade,
--   user_id      uuid not null references public.profiles(id) on delete cascade,
--   theme_text   text not null,
--   keywords     text[] not null default '{}',
--   used_at      timestamptz,
--   created_at   timestamptz not null default now()
-- );
-- create index if not exists contact_themes_contact_id_idx on public.contact_themes(contact_id);
-- create index if not exists contact_themes_user_unused_idx on public.contact_themes(user_id) where used_at is null;
-- alter table public.contact_themes enable row level security;
-- create policy "contact_themes: owner all" on public.contact_themes for all using (auth.uid() = user_id);
--
-- alter table public.connection_proofs
--   add column if not exists contact_id uuid references public.contacts(id) on delete set null,
--   add column if not exists theme_id   uuid references public.contact_themes(id) on delete set null;
--
-- alter table public.routines drop column if exists trusted_contacts;
--
-- drop trigger if exists set_contacts_updated_at on public.contacts;
-- create trigger set_contacts_updated_at
--   before update on public.contacts
--   for each row execute procedure public.set_updated_at();

-- ============================================================
-- Peak Fitness — KOMPLETT databas-migration
-- ============================================================
-- Kör HELA denna fil i Supabase SQL Editor när som helst.
-- Allt är idempotent (if not exists / or replace) → säkert att köra om.
-- Använd denna om du är osäker på om någon kolumn/tabell saknas.
--
-- Projekt: xywrlqqvdptafunsqebi ("Peak Fitness")
-- Senast uppdaterad: 2026-05-22
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  age int,
  weight_kg numeric,
  height_cm numeric,
  level text default 'beginner',
  theme text default 'light',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- Tillägg: födelsedatum (ålder beräknas i appen)
alter table public.profiles add column if not exists birth_date date;

-- ------------------------------------------------------------
-- 2. EXERCISES (övningsbanken)
-- ------------------------------------------------------------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  muscle text,
  form_tags jsonb default '[]'::jsonb,
  custom_tags jsonb default '[]'::jsonb,
  default_sets int default 3,
  default_reps int default 10,
  media_url text,
  fav boolean default false,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists exercises_user_id_idx on public.exercises(user_id);
-- Tillägg: tutorial-video-länk (YouTube/Vimeo)
alter table public.exercises add column if not exists video_url text;
-- Tillägg: kondition/cardio-defaults (distans km + tid min som DECIMAL, pulszon som heltal)
alter table public.exercises add column if not exists default_distance numeric;
alter table public.exercises add column if not exists default_time numeric;
alter table public.exercises add column if not exists pulse_zone int;
-- Tillägg: klassificering som persistar (annars re-deriveras/tappas vid sync)
alter table public.exercises add column if not exists primary_form text;
alter table public.exercises add column if not exists use_bodyweight boolean default false;
alter table public.exercises add column if not exists sub_tags jsonb default '[]'::jsonb;

-- ------------------------------------------------------------
-- 3. TRAINING FORMS
-- ------------------------------------------------------------
create table if not exists public.training_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  cat text,
  created_at timestamptz default now()
);
create index if not exists training_forms_user_id_idx on public.training_forms(user_id);

-- ------------------------------------------------------------
-- 4. PASS TYPES (träningspass)
-- ------------------------------------------------------------
create table if not exists public.pass_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  training_form_id uuid references public.training_forms(id) on delete cascade,
  name text not null,
  description text,
  color text default '#5b52f0',
  form_tags jsonb default '[]'::jsonb,
  exercise_refs jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists pass_types_user_id_idx on public.pass_types(user_id);
create index if not exists pass_types_form_idx on public.pass_types(training_form_id);
-- Tillägg: egna taggar på pass (utrustning/plats: utegym, hantlar...)
alter table public.pass_types add column if not exists custom_tags jsonb default '[]'::jsonb;

-- ------------------------------------------------------------
-- 5. PLANNED WORKOUTS (kalender + schema)
-- ------------------------------------------------------------
create table if not exists public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pass_id uuid references public.pass_types(id) on delete set null,
  date date not null,
  notes text,
  created_at timestamptz default now()
);
create index if not exists planned_workouts_user_date_idx on public.planned_workouts(user_id, date);

-- ------------------------------------------------------------
-- 6. WORKOUT HISTORY (loggade pass)
-- ------------------------------------------------------------
create table if not exists public.workout_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pass_id uuid references public.pass_types(id) on delete set null,
  pass_name text,
  form_name text,
  form_cat text,
  performed_at timestamptz not null default now(),
  duration_seconds int,
  feel int check (feel between 1 and 5),
  note text,
  exercises jsonb,
  created_at timestamptz default now()
);
create index if not exists workout_history_user_date_idx on public.workout_history(user_id, performed_at desc);

-- ------------------------------------------------------------
-- 7. USER GOALS
-- ------------------------------------------------------------
create table if not exists public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  current_value text,
  target_value text,
  progress int default 0,
  color text default '#e8440a',
  target_weeks int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists user_goals_user_id_idx on public.user_goals(user_id);
-- Tillägg v2: auto-tracking av mål
alter table public.user_goals add column if not exists tracking_mode text default 'manual';
alter table public.user_goals add column if not exists exercise_name text;
alter table public.user_goals add column if not exists metric text;
alter table public.user_goals add column if not exists start_value numeric;
alter table public.user_goals add column if not exists target_value_num numeric;
alter table public.user_goals add column if not exists start_date date;

-- ------------------------------------------------------------
-- 8. SHARES (delningsfunktion)
-- ------------------------------------------------------------
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,            -- 'pass' | 'program' | 'exercise'
  title text,
  payload jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists shares_code_idx on public.shares(code);
create index if not exists shares_owner_idx on public.shares(owner_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.training_forms enable row level security;
alter table public.pass_types enable row level security;
alter table public.planned_workouts enable row level security;
alter table public.workout_history enable row level security;
alter table public.user_goals enable row level security;
alter table public.shares enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own exercises" on public.exercises;
create policy "own exercises" on public.exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own training forms" on public.training_forms;
create policy "own training forms" on public.training_forms
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own pass types" on public.pass_types;
create policy "own pass types" on public.pass_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own planned workouts" on public.planned_workouts;
create policy "own planned workouts" on public.planned_workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own workout history" on public.workout_history;
create policy "own workout history" on public.workout_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own goals" on public.user_goals;
create policy "own goals" on public.user_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Shares: ägaren kan göra allt med sina egna delningar
drop policy if exists "own shares" on public.shares;
create policy "own shares" on public.shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ============================================================
-- RPC: läs en delning via kod (säker — exponerar inte hela tabellen)
-- ============================================================
create or replace function public.get_share(share_code text)
returns table(id uuid, code text, type text, title text, payload jsonb, owner_id uuid, updated_at timestamptz)
language sql security definer stable
as $$
  select id, code, type, title, payload, owner_id, updated_at
  from public.shares
  where code = upper(share_code)
  limit 1;
$$;
grant execute on function public.get_share(text) to anon, authenticated;

-- ============================================================
-- TRIGGER: skapa profil automatiskt vid registrering
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Ladda om PostgREST schema-cache (så nya kolumner syns direkt)
-- ============================================================
notify pgrst, 'reload schema';

-- ============================================================
-- KLART! Hela schemat är på plats.
-- ============================================================

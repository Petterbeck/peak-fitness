-- ============================================================
-- Peak Fitness — schema-uppdatering v2
-- Lägger till kolumner för auto-tracking av mål
-- Säker att köra flera gånger (uses if not exists)
-- ============================================================

alter table public.user_goals
  add column if not exists tracking_mode text default 'manual',
  add column if not exists exercise_name text,
  add column if not exists metric text,
  add column if not exists start_value numeric,
  add column if not exists target_value_num numeric,
  add column if not exists start_date date;

-- Befintliga rader får tracking_mode = 'manual' automatiskt (default)
update public.user_goals
  set tracking_mode = 'manual'
  where tracking_mode is null;

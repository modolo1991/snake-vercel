-- Snake Deluxe Supabase schema
-- Run in the Supabase SQL editor.

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  best_score integer not null default 0 check (best_score >= 0),
  coins integer not null default 0 check (coins >= 0),
  owned_items text[] not null default array['skin-mint']::text[],
  equipped_skin text not null default 'skin-mint',
  active_powers text[] not null default array[]::text[],
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_progress enable row level security;

create policy "Users can view their own progress"
on public.user_progress
for select
using (auth.uid() = user_id);

create policy "Users can insert their own progress"
on public.user_progress
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own progress"
on public.user_progress
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_user_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_progress on auth.users;
create trigger on_auth_user_created_progress
  after insert on auth.users
  for each row execute procedure public.handle_new_user_progress();

-- Habit tracker: run this in the Supabase SQL editor.

alter table projects
  add column if not exists habit_goal integer;

create table if not exists habit_marks (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (project_id, day)
);

create index if not exists habit_marks_project_day_idx
  on habit_marks (project_id, day);

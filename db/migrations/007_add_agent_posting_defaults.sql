alter table agents
  add column if not exists agent_framework text,
  add column if not exists task_type text,
  add column if not exists environment text,
  add column if not exists systems_involved_text text,
  add column if not exists version_details_text text,
  add column if not exists confidence text check (confidence in ('confirmed', 'likely', 'experimental')),
  add column if not exists structured_post_type text;

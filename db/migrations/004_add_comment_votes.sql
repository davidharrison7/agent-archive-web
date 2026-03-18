create table if not exists comment_votes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comment_id, agent_id)
);

create index if not exists idx_comment_votes_comment_agent on comment_votes(comment_id, agent_id);

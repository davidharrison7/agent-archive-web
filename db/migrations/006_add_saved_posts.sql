create table if not exists agent_saved_posts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agent_id, post_id)
);

create index if not exists idx_agent_saved_posts_agent on agent_saved_posts(agent_id, created_at desc);
create index if not exists idx_agent_saved_posts_post on agent_saved_posts(post_id, agent_id);

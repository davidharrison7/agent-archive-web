create table if not exists agent_community_memberships (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agent_id, community_id)
);

create index if not exists idx_agent_community_memberships_agent on agent_community_memberships(agent_id, created_at desc);
create index if not exists idx_agent_community_memberships_community on agent_community_memberships(community_id, created_at desc);

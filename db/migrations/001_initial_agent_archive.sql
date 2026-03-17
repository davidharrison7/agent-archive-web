create extension if not exists "pgcrypto";

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  display_name text,
  provider text,
  default_model text,
  runtime text,
  operator_name text,
  bio text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'suspended', 'pending_claim')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  key_prefix text not null,
  key_hash text not null unique,
  label text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists human_admins (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  role text not null default 'human_admin' check (role in ('human_admin')),
  granted_by_agent_id uuid references agents(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  focus text,
  audience text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references tracks(id) on delete cascade,
  slug text not null unique,
  submolt_name text unique,
  name text not null,
  description text not null,
  when_to_post text not null,
  created_by_agent_id uuid references agents(id),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists community_moderators (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  moderator_type text not null check (moderator_type in ('agent_moderator', 'human_moderator')),
  scope text not null default 'community',
  granted_by_agent_id uuid references agents(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  slug text not null unique,
  title text not null,
  summary text not null,
  thread_type text not null check (thread_type in ('issue_family', 'workflow', 'comparison', 'playbook', 'observations')),
  canonical_status text not null default 'canonical' check (canonical_status in ('canonical', 'candidate', 'superseded')),
  superseded_by_thread_id uuid references threads(id),
  created_by_agent_id uuid references agents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  thread_id uuid references threads(id) on delete set null,
  agent_id uuid not null references agents(id) on delete cascade,
  title text not null,
  summary text not null,
  body_markdown text,
  post_type text not null check (post_type in ('observations', 'bug', 'fix', 'workaround', 'workflow', 'search_pattern', 'response_pattern', 'comparison', 'incident_report', 'playbook')),
  provider text not null,
  model text not null,
  agent_framework text not null,
  runtime text not null,
  task_type text not null,
  environment text not null,
  systems_involved_text text not null,
  version_details_text text not null,
  problem_or_goal text not null,
  what_worked text not null,
  what_failed text not null,
  confidence text not null check (confidence in ('confirmed', 'likely', 'experimental')),
  date_observed date not null,
  error_text text,
  url text,
  score integer not null default 0,
  comment_count integer not null default 0,
  prompt_injection_risk text not null default 'low' check (prompt_injection_risk in ('low', 'medium', 'high')),
  prompt_injection_signals jsonb not null default '[]'::jsonb,
  moderation_state text not null default 'published' check (moderation_state in ('published', 'needs_context', 'under_review', 'escalated', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tag_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists post_tags (
  post_id uuid not null references posts(id) on delete cascade,
  tag_id uuid not null references tag_definitions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id)
);

create table if not exists post_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, agent_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,
  content text not null,
  score integer not null default 0,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  depth integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_follows (
  id uuid primary key default gen_random_uuid(),
  follower_agent_id uuid not null references agents(id) on delete cascade,
  followed_agent_id uuid not null references agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_agent_id, followed_agent_id),
  check (follower_agent_id <> followed_agent_id)
);

create table if not exists moderation_queue (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  thread_id uuid references threads(id) on delete set null,
  status text not null check (status in ('needs_context', 'possible_duplicate', 'suggest_merge', 'escalated_to_human', 'resolved')),
  reason text not null,
  suggested_action text not null,
  assigned_role text not null check (assigned_role in ('agent_moderator', 'human_admin')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists moderation_actions (
  id uuid primary key default gen_random_uuid(),
  queue_item_id uuid not null references moderation_queue(id) on delete cascade,
  actor_type text not null check (actor_type in ('agent', 'human')),
  actor_agent_id uuid references agents(id) on delete set null,
  action_type text not null check (action_type in ('created', 'request_context', 'suggest_merge', 'escalate', 'resolve')),
  details text,
  created_at timestamptz not null default now()
);

create table if not exists moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  actor_type text not null check (actor_type in ('agent', 'human')),
  actor_agent_id uuid references agents(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_communities_track_slug on communities(track_id, slug);
create index if not exists idx_threads_community_slug on threads(community_id, slug);
create index if not exists idx_agent_api_keys_agent_active on agent_api_keys(agent_id) where revoked_at is null;
create index if not exists idx_posts_community_created_at on posts(community_id, created_at desc);
create index if not exists idx_posts_thread_created_at on posts(thread_id, created_at desc);
create index if not exists idx_posts_provider_runtime_environment on posts(provider, runtime, environment);
create index if not exists idx_posts_prompt_injection_risk on posts(prompt_injection_risk, created_at desc);
create index if not exists idx_tag_definitions_name on tag_definitions(name);
create index if not exists idx_post_tags_tag on post_tags(tag_id, post_id);
create index if not exists idx_post_votes_post_agent on post_votes(post_id, agent_id);
create index if not exists idx_comments_post_created_at on comments(post_id, created_at asc);
create index if not exists idx_comments_parent_created_at on comments(parent_id, created_at asc);
create index if not exists idx_agent_follows_followed on agent_follows(followed_agent_id, created_at desc);
create index if not exists idx_agent_follows_follower on agent_follows(follower_agent_id, created_at desc);
create index if not exists idx_moderation_queue_status_role_created_at on moderation_queue(status, assigned_role, created_at desc);
create index if not exists idx_moderation_actions_queue_created_at on moderation_actions(queue_item_id, created_at desc);
create index if not exists idx_moderation_audit_target_created_at on moderation_audit_log(target_type, target_id, created_at desc);
create index if not exists idx_human_admins_active on human_admins(agent_id) where revoked_at is null;

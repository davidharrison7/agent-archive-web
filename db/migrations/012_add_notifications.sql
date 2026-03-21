alter table agents
  add column if not exists notification_replies_enabled boolean not null default true,
  add column if not exists notification_mentions_enabled boolean not null default true;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_agent_id uuid not null references agents(id) on delete cascade,
  actor_agent_id uuid references agents(id) on delete set null,
  post_id uuid references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  type text not null check (type in ('mention', 'comment_on_post', 'reply_to_comment')),
  title text not null,
  body text not null,
  link text,
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_created_at
  on notifications (recipient_agent_id, created_at desc);

create index if not exists idx_notifications_recipient_unread
  on notifications (recipient_agent_id, read_at);

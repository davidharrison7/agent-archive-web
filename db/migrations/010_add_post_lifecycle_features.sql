alter table posts
  add column if not exists lifecycle_state text not null default 'open'
    check (lifecycle_state in ('open', 'resolved', 'closed')),
  add column if not exists resolved_comment_id uuid references comments(id) on delete set null,
  add column if not exists follow_up_to_post_id uuid references posts(id) on delete set null;

create index if not exists idx_posts_lifecycle_state_created_at
on posts (lifecycle_state, created_at desc);

create index if not exists idx_posts_follow_up_to_post
on posts (follow_up_to_post_id);

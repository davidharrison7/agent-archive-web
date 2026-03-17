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

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'tags_text'
  ) then
    insert into tag_definitions (name)
    select distinct lower(trim(tag_name))
    from (
      select unnest(string_to_array(coalesce(tags_text, ''), ',')) as tag_name
      from posts
    ) extracted
    where trim(tag_name) <> ''
    on conflict (name) do nothing;

    insert into post_tags (post_id, tag_id)
    select distinct posts.id, tag_definitions.id
    from posts
    cross join lateral unnest(string_to_array(coalesce(posts.tags_text, ''), ',')) as raw_tag(tag_name)
    join tag_definitions on tag_definitions.name = lower(trim(raw_tag.tag_name))
    where trim(raw_tag.tag_name) <> ''
    on conflict (post_id, tag_id) do nothing;
  end if;
end $$;

drop index if exists idx_tag_definitions_name;
create index if not exists idx_tag_definitions_name on tag_definitions(name);
create index if not exists idx_post_tags_tag on post_tags(tag_id, post_id);

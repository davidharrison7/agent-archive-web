create extension if not exists pg_trgm;

create index if not exists idx_posts_title_trgm
on posts using gin (lower(title) gin_trgm_ops);

create index if not exists idx_posts_model_trgm
on posts using gin (lower(model) gin_trgm_ops);

create index if not exists idx_posts_agent_framework_trgm
on posts using gin (lower(agent_framework) gin_trgm_ops);

create index if not exists idx_agents_handle_trgm
on agents using gin (lower(handle) gin_trgm_ops);

create index if not exists idx_agents_display_name_trgm
on agents using gin (lower(display_name) gin_trgm_ops);

create index if not exists idx_communities_slug_trgm
on communities using gin (lower(slug) gin_trgm_ops);

create index if not exists idx_communities_name_trgm
on communities using gin (lower(name) gin_trgm_ops);

create index if not exists idx_communities_community_name_trgm
on communities using gin (lower(community_name) gin_trgm_ops);

create index if not exists idx_tag_definitions_name_trgm
on tag_definitions using gin (lower(name) gin_trgm_ops);

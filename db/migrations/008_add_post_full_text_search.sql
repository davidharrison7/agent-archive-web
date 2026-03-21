create index if not exists idx_posts_search_document on posts
using gin (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' ||
    coalesce(summary, '') || ' ' ||
    coalesce(problem_or_goal, '') || ' ' ||
    coalesce(what_worked, '') || ' ' ||
    coalesce(what_failed, '') || ' ' ||
    coalesce(provider, '') || ' ' ||
    coalesce(model, '') || ' ' ||
    coalesce(agent_framework, '') || ' ' ||
    coalesce(runtime, '') || ' ' ||
    coalesce(environment, '') || ' ' ||
    coalesce(task_type, '') || ' ' ||
    coalesce(systems_involved_text, '') || ' ' ||
    coalesce(version_details_text, '')
  )
);

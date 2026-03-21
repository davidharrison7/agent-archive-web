alter table posts
  drop constraint if exists posts_post_type_check;

alter table posts
  add constraint posts_post_type_check
  check (post_type in ('observations', 'bug', 'fix', 'workaround', 'workflow', 'search_pattern', 'response_pattern', 'comparison', 'incident_report', 'playbook', 'question'));

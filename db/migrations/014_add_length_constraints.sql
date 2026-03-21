do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_title_length_check') then
    alter table posts
      add constraint posts_title_length_check
      check (char_length(title) <= 300) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_summary_length_check') then
    alter table posts
      add constraint posts_summary_length_check
      check (char_length(summary) <= 1500) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_body_markdown_length_check') then
    alter table posts
      add constraint posts_body_markdown_length_check
      check (body_markdown is null or char_length(body_markdown) <= 40000) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_provider_length_check') then
    alter table posts
      add constraint posts_provider_length_check
      check (char_length(provider) <= 40) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_model_length_check') then
    alter table posts
      add constraint posts_model_length_check
      check (char_length(model) <= 80) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_agent_framework_length_check') then
    alter table posts
      add constraint posts_agent_framework_length_check
      check (char_length(agent_framework) <= 60) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_runtime_length_check') then
    alter table posts
      add constraint posts_runtime_length_check
      check (char_length(runtime) <= 40) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_task_type_length_check') then
    alter table posts
      add constraint posts_task_type_length_check
      check (char_length(task_type) <= 40) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_environment_length_check') then
    alter table posts
      add constraint posts_environment_length_check
      check (char_length(environment) <= 40) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_systems_involved_text_length_check') then
    alter table posts
      add constraint posts_systems_involved_text_length_check
      check (char_length(systems_involved_text) <= 240) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_version_details_text_length_check') then
    alter table posts
      add constraint posts_version_details_text_length_check
      check (char_length(version_details_text) <= 240) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_problem_or_goal_length_check') then
    alter table posts
      add constraint posts_problem_or_goal_length_check
      check (char_length(problem_or_goal) <= 1800) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_what_worked_length_check') then
    alter table posts
      add constraint posts_what_worked_length_check
      check (char_length(what_worked) <= 1800) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_what_failed_length_check') then
    alter table posts
      add constraint posts_what_failed_length_check
      check (char_length(what_failed) <= 1800) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'comments_content_length_check') then
    alter table comments
      add constraint comments_content_length_check
      check (char_length(content) <= 10000) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tag_definitions_name_length_check') then
    alter table tag_definitions
      add constraint tag_definitions_name_length_check
      check (char_length(name) <= 24) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_description_length_check') then
    alter table communities
      add constraint communities_description_length_check
      check (char_length(description) <= 500) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'communities_when_to_post_length_check') then
    alter table communities
      add constraint communities_when_to_post_length_check
      check (char_length(when_to_post) <= 500) not valid;
  end if;
end $$;

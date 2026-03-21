do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agents_handle_format_check') then
    alter table agents
      add constraint agents_handle_format_check
      check (
        char_length(handle) between 2 and 32
        and handle ~ '^[a-z0-9_]+$'
      ) not valid;
  end if;
end $$;

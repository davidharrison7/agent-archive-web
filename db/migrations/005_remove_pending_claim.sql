update agents
set status = 'active'
where status = 'pending_claim';

alter table agents
  drop constraint if exists agents_status_check;

alter table agents
  add constraint agents_status_check
  check (status in ('active', 'suspended'));

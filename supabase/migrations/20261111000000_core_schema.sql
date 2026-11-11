-- Pillars KPI Portal — core schema (people, months, KPIs, daily figures, Daily Brief,
-- submissions, working calendar, audit log) with row-level security.
--
-- Access model
--   * management          : reads and writes everything
--   * view_all officials  : read every official (Venkat, C. Pradeep, A. Krishna Prakash); write only their own
--   * officials           : read and write only their own rows
-- KPI definitions (targets, weights, min %) can only be changed by management.
-- Daily Brief entries are written only through the RPCs below, so the approval rule
-- ("needs approval" KPIs go to Pending approval) is enforced on the server.

create extension if not exists pgcrypto;

-- ───────────────────────── tables ─────────────────────────

create table public.people (
  id          text primary key,
  sno         int  not null default 0,
  name        text not null,
  designation text not null default '',
  role        text not null default 'member' check (role in ('member', 'management')),
  view_all    boolean not null default false,
  reports_to  text references public.people(id) on delete set null,
  auth_uid    uuid unique references auth.users(id) on delete set null,
  login_email text unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.months (
  mk         text primary key check (mk ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now()
);

create table public.month_people (
  mk          text not null references public.months(mk) on delete cascade,
  person_id   text not null references public.people(id) on delete cascade,
  sno         int  not null default 0,
  name        text not null default '',
  designation text not null default '',
  primary key (mk, person_id)
);

create table public.kpis (
  mk          text not null,
  id          text not null,
  person_id   text not null,
  pos         int  not null default 0,
  name        text not null,
  freq        text not null default 'Monthly',
  uom         text not null default 'Nos',
  monthly     numeric not null default 0,
  min         numeric not null default 100,
  prorate     boolean not null default false,
  agg         text not null default 'sum' check (agg in ('sum', 'latest')),
  lower       boolean not null default false,
  weight      numeric not null default 1,
  na          boolean not null default false,
  approval    boolean not null default false,
  module      text not null default '' check (module in ('', 'meeting', 'cascade', 'team')),
  meet_rule   text not null default '',
  meet_kw     text,
  need_mom    boolean not null default false,
  per_day_ov  numeric,
  till_ov     numeric,
  primary key (mk, id),
  foreign key (mk, person_id) references public.month_people(mk, person_id) on delete cascade
);
create index kpis_person_idx on public.kpis(person_id);

create table public.daily_log (
  kpi_id    text not null,
  d         date not null,
  person_id text not null references public.people(id) on delete cascade,
  ach       numeric,
  primary key (kpi_id, d)
);
create index daily_log_person_idx on public.daily_log(person_id, d);

create table public.remarks (
  mk        text not null,
  kpi_id    text not null,
  person_id text not null references public.people(id) on delete cascade,
  text      text not null default '',
  primary key (mk, kpi_id)
);

create table public.entries (
  id          text primary key default gen_random_uuid()::text,
  person_id   text not null references public.people(id) on delete cascade,
  by_person   text references public.people(id) on delete set null,
  d           date not null,
  kid         text not null,               -- KPI id, or '__other' (not counted)
  activity    text not null default '',
  qty         numeric,
  link        text not null default '',
  status      text not null default 'Completed'
              check (status in ('Not started', 'In progress', 'Pending approval', 'Completed', 'On hold', 'Rejected')),
  due         date,
  blocker     text not null default '',
  next        text not null default '',
  goal_id     text,
  todo_id     text,
  reviewed_by text,
  reviewed_at timestamptz,
  edited_by   text,
  edited_at   timestamptz,
  extra       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index entries_person_idx on public.entries(person_id, d);

create table public.submissions (
  person_id text not null references public.people(id) on delete cascade,
  d         date not null,
  at        timestamptz not null default now(),
  by_person text,
  primary key (person_id, d)
);

create table public.settings (
  key   text primary key,
  value jsonb not null
);
insert into public.settings(key, value) values
  ('calendar', '{"off":[0],"holidays":[]}'::jsonb),
  ('remind_at', '"18:00"'::jsonb),
  ('scoring', '{"scoring":"Weighted","arrowRule":"Below min %","highlightBelowMin":true}'::jsonb);

create table public.audit_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  by_person text,
  by_name   text not null default '—',
  action    text not null,
  detail    text not null default ''
);
create index audit_log_at_idx on public.audit_log(at desc);

-- One-time codes that let the admin-users edge function create the first logins.
create table public.bootstrap_codes (
  code       text primary key,
  created_at timestamptz not null default now()
);

-- ───────────────────────── access helpers ─────────────────────────

create or replace function public.my_pid() returns text
language sql stable security definer set search_path = public as $$
  select id from public.people where auth_uid = auth.uid() and active
$$;

create or replace function public.is_mgmt() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'management' from public.people where auth_uid = auth.uid() and active), false)
$$;

create or replace function public.can_view_all() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'management' or view_all from public.people where auth_uid = auth.uid() and active), false)
$$;

create or replace function public.can_read_person(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = public.my_pid() or public.can_view_all()
$$;

create or replace function public.can_write_person(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = public.my_pid() or public.is_mgmt()
$$;

create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.people where auth_uid = auth.uid()), '—')
$$;

-- ───────────────────────── row-level security ─────────────────────────

alter table public.people          enable row level security;
alter table public.months          enable row level security;
alter table public.month_people    enable row level security;
alter table public.kpis            enable row level security;
alter table public.daily_log       enable row level security;
alter table public.remarks         enable row level security;
alter table public.entries         enable row level security;
alter table public.submissions     enable row level security;
alter table public.settings        enable row level security;
alter table public.audit_log       enable row level security;
alter table public.bootstrap_codes enable row level security;  -- no policies: service role only

-- people: everyone signed in sees the directory (org chart); management edits it.
create policy people_read  on public.people for select to authenticated using (true);
create policy people_write on public.people for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());

create policy months_read  on public.months for select to authenticated using (true);
create policy months_write on public.months for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());

create policy mp_read  on public.month_people for select to authenticated using (public.can_read_person(person_id));
create policy mp_write on public.month_people for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());

create policy kpis_read  on public.kpis for select to authenticated using (public.can_read_person(person_id));
create policy kpis_write on public.kpis for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());

-- daily figures: own sheet (or management). The KPI must belong to that person.
create policy log_read  on public.daily_log for select to authenticated using (public.can_read_person(person_id));
create policy log_write on public.daily_log for all to authenticated
  using (public.can_write_person(person_id))
  with check (public.can_write_person(person_id)
              and exists (select 1 from public.kpis k where k.id = kpi_id and k.person_id = daily_log.person_id));

create policy rem_read  on public.remarks for select to authenticated using (public.can_read_person(person_id));
create policy rem_write on public.remarks for all to authenticated
  using (public.can_write_person(person_id)) with check (public.can_write_person(person_id));

-- entries: read own / all; writes only via RPCs (no write policy).
create policy entries_read on public.entries for select to authenticated using (public.can_read_person(person_id));

create policy sub_read  on public.submissions for select to authenticated using (public.can_read_person(person_id));
create policy sub_write on public.submissions for all to authenticated
  using (public.can_write_person(person_id)) with check (public.can_write_person(person_id));

create policy settings_read  on public.settings for select to authenticated using (true);
create policy settings_write on public.settings for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());

create policy audit_read on public.audit_log for select to authenticated using (public.is_mgmt());

-- ───────────────────────── RPCs ─────────────────────────

-- Names for the sign-in screen (anon can call; returns no ids of auth users).
create or replace function public.login_directory()
returns table (id text, sno int, name text, role text, login_email text)
language sql stable security definer set search_path = public as $$
  select id, sno, name, role, login_email from public.people
  where active and login_email is not null
  order by (role = 'management'), sno
$$;
grant execute on function public.login_directory() to anon, authenticated;

create or replace function public.log_audit(p_action text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_pid() is null then raise exception 'not signed in'; end if;
  insert into public.audit_log(by_person, by_name, action, detail)
  values (public.my_pid(), public.my_name(), left(p_action, 120), left(coalesce(p_detail, ''), 2000));
end $$;

-- internal: add delta to a day's figure
create or replace function public._bump(p_kid text, p_d date, p_pid text, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kid = '__other' or coalesce(p_delta, 0) = 0 then return; end if;
  insert into public.daily_log(kpi_id, d, person_id, ach) values (p_kid, p_d, p_pid, round(p_delta, 3))
  on conflict (kpi_id, d) do update set ach = round(coalesce(public.daily_log.ach, 0) + excluded.ach, 3);
end $$;
revoke execute on function public._bump(text, date, text, numeric) from public, anon, authenticated;

create or replace function public._kpi_of(p_kid text, p_d date)
returns public.kpis language sql stable security definer set search_path = public as $$
  select * from public.kpis where id = p_kid and mk = to_char(p_d, 'YYYY-MM') limit 1
$$;
revoke execute on function public._kpi_of(text, date) from public, anon, authenticated;

-- Add a Daily Brief entry. Completed work on a counted KPI adds to that day's figure.
create or replace function public.add_entry(p jsonb)
returns public.entries language plpgsql security definer set search_path = public as $$
declare
  v_pid text := p->>'person_id';
  v_kid text := coalesce(p->>'kid', '');
  v_d   date := (p->>'d')::date;
  v_st  text := coalesce(nullif(p->>'status', ''), 'Completed');
  v_k   public.kpis;
  v_row public.entries;
begin
  if not public.can_write_person(v_pid) then raise exception 'not allowed'; end if;
  if v_kid <> '__other' then
    v_k := public._kpi_of(v_kid, v_d);
    if v_k.id is null or v_k.person_id <> v_pid then raise exception 'KPI not found for this official and month'; end if;
    if v_k.module <> '' then raise exception 'This KPI is calculated by its tracker'; end if;
    if (p->>'qty') is null or (p->>'qty') = '' then raise exception 'Achieved quantity is required'; end if;
    if v_st = 'Completed' and v_k.approval and not public.is_mgmt() then v_st := 'Pending approval'; end if;
  else
    if v_st = 'Pending approval' then v_st := 'Completed'; end if;
  end if;
  if not public.is_mgmt() and v_st in ('Pending approval', 'Rejected') and not (v_kid <> '__other' and v_k.approval) then
    v_st := 'In progress';
  end if;
  insert into public.entries(person_id, by_person, d, kid, activity, qty, link, status, due, blocker, next, goal_id, todo_id)
  values (v_pid, public.my_pid(), v_d, v_kid, coalesce(p->>'activity', ''), nullif(p->>'qty', '')::numeric,
          coalesce(p->>'link', ''), v_st, nullif(p->>'due', '')::date, coalesce(p->>'blocker', ''), coalesce(p->>'next', ''),
          nullif(p->>'goal_id', ''), nullif(p->>'todo_id', ''))
  returning * into v_row;
  if v_st = 'Completed' then perform public._bump(v_kid, v_d, v_pid, v_row.qty); end if;
  return v_row;
end $$;

-- Change an entry's status. Only management can approve / reject.
create or replace function public.set_entry_status(p_id text, p_status text)
returns public.entries language plpgsql security definer set search_path = public as $$
declare
  e public.entries; v_k public.kpis; v_st text := p_status; was text; d numeric;
begin
  select * into e from public.entries where id = p_id for update;
  if e.id is null then raise exception 'entry not found'; end if;
  if not public.can_write_person(e.person_id) then raise exception 'not allowed'; end if;
  was := e.status;
  if e.kid <> '__other' then v_k := public._kpi_of(e.kid, e.d); end if;
  if not public.is_mgmt() then
    if v_st = 'Rejected' or v_st = 'Pending approval' and not coalesce(v_k.approval, false) then raise exception 'Only management can do that'; end if;
    if was in ('Pending approval', 'Rejected') and v_st = 'Completed' then raise exception 'Waiting for management approval'; end if;
    if v_st = 'Completed' and coalesce(v_k.approval, false) then v_st := 'Pending approval'; end if;
  end if;
  if v_st = was then return e; end if;
  d := (case when v_st = 'Completed' then 1 else 0 end) - (case when was = 'Completed' then 1 else 0 end);
  update public.entries set status = v_st,
    reviewed_by = case when public.is_mgmt() and v_st in ('Completed', 'Rejected') then public.my_name() else reviewed_by end,
    reviewed_at = case when public.is_mgmt() and v_st in ('Completed', 'Rejected') then now() else reviewed_at end
  where id = p_id returning * into e;
  if d <> 0 then perform public._bump(e.kid, e.d, e.person_id, d * coalesce(e.qty, 0)); end if;
  return e;
end $$;

-- Edit an entry's details. If it is Completed, its quantity moves with it.
create or replace function public.update_entry(p_id text, p jsonb)
returns public.entries language plpgsql security definer set search_path = public as $$
declare
  e public.entries; n public.entries; v_k public.kpis;
begin
  select * into e from public.entries where id = p_id for update;
  if e.id is null then raise exception 'entry not found'; end if;
  if not (public.is_mgmt() or e.by_person = public.my_pid() or e.person_id = public.my_pid()) then raise exception 'not allowed'; end if;
  n := e;
  if p ? 'd'        then n.d := (p->>'d')::date; end if;
  if p ? 'kid'      then n.kid := p->>'kid'; end if;
  if p ? 'activity' then n.activity := coalesce(p->>'activity', ''); end if;
  if p ? 'qty'      then n.qty := nullif(p->>'qty', '')::numeric; end if;
  if p ? 'due'      then n.due := nullif(p->>'due', '')::date; end if;
  if p ? 'blocker'  then n.blocker := coalesce(p->>'blocker', ''); end if;
  if p ? 'next'     then n.next := coalesce(p->>'next', ''); end if;
  if p ? 'link'     then n.link := coalesce(p->>'link', ''); end if;
  if n.kid <> '__other' then
    v_k := public._kpi_of(n.kid, n.d);
    if v_k.id is null or v_k.person_id <> e.person_id or v_k.module <> '' then raise exception 'KPI not found for this official and month'; end if;
  end if;
  if e.status = 'Completed' then perform public._bump(e.kid, e.d, e.person_id, -coalesce(e.qty, 0)); end if;
  update public.entries set d = n.d, kid = n.kid, activity = n.activity, qty = n.qty, due = n.due, blocker = n.blocker,
    next = n.next, link = n.link, edited_by = public.my_name(), edited_at = now()
  where id = p_id returning * into n;
  if n.status = 'Completed' then perform public._bump(n.kid, n.d, n.person_id, coalesce(n.qty, 0)); end if;
  return n;
end $$;

create or replace function public.delete_entry(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_id for update;
  if e.id is null then return; end if;
  if not (public.is_mgmt() or e.by_person = public.my_pid() or e.person_id = public.my_pid()) then raise exception 'not allowed'; end if;
  if e.status = 'Completed' then perform public._bump(e.kid, e.d, e.person_id, -coalesce(e.qty, 0)); end if;
  delete from public.entries where id = p_id;
end $$;

-- Create a month, optionally copying people and KPIs from another month (daily figures start blank).
create or replace function public.create_month(p_target text, p_src text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_mgmt() then raise exception 'Only management can create months'; end if;
  insert into public.months(mk) values (p_target) on conflict do nothing;
  if p_src is not null and p_src <> '' then
    insert into public.month_people(mk, person_id, sno, name, designation)
      select p_target, person_id, sno, name, designation from public.month_people where mk = p_src
      on conflict do nothing;
    insert into public.kpis(mk, id, person_id, pos, name, freq, uom, monthly, min, prorate, agg, lower, weight, na, approval,
                            module, meet_rule, meet_kw, need_mom, per_day_ov, till_ov)
      select p_target, id, person_id, pos, name, freq, uom, monthly, min, prorate, agg, lower, weight, na, approval,
             module, meet_rule, meet_kw, need_mom, null, null
      from public.kpis where mk = p_src
      on conflict do nothing;
  else
    insert into public.month_people(mk, person_id, sno, name, designation)
      select p_target, id, sno, name, designation from public.people where active and role = 'member'
      on conflict do nothing;
  end if;
  perform public.log_audit('Month created', p_target || coalesce(' — copied from ' || nullif(p_src, ''), ' — blank'));
end $$;

-- Import a backup file from the standalone HTML portal (management only).
-- Replaces months, KPIs, daily figures, remarks, entries, submissions and calendar.
-- People are upserted by id; their logins are kept.
create or replace function public.import_backup(b jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mk text; mo jsonb; p jsonb; k jsonb; i int; dkey text; dv jsonb; kid text; u jsonb; e jsonb; s_pid text; s_day text;
  n_k int := 0; n_e int := 0; n_l int := 0;
  bootstrap boolean := not exists (select 1 from public.people where auth_uid is not null);
begin
  if not (public.is_mgmt() or (bootstrap and session_user in ('postgres', 'supabase_admin'))) then
    raise exception 'Only management can import';
  end if;
  if b->'months' is null then raise exception 'Not a KPI portal backup'; end if;

  -- people
  for u in select * from jsonb_array_elements(coalesce(b->'users', '[]'::jsonb)) loop
    insert into public.people(id, sno, name, designation, role, view_all)
    values (u->>'id', coalesce((u->>'sno')::int, 0), coalesce(u->>'name', ''), coalesce(u->>'designation', ''),
            coalesce(nullif(u->>'role', ''), 'member'), coalesce((u->>'viewAll')::boolean, false))
    on conflict (id) do update set sno = excluded.sno, name = excluded.name, designation = excluded.designation,
      role = excluded.role, view_all = excluded.view_all;
  end loop;
  for u in select * from jsonb_array_elements(coalesce(b->'users', '[]'::jsonb)) loop
    update public.people set reports_to = (select id from public.people where id = nullif(u->>'reportsTo', ''))
    where id = u->>'id';
  end loop;

  delete from public.entries; delete from public.daily_log; delete from public.remarks; delete from public.submissions;
  delete from public.kpis; delete from public.month_people; delete from public.months;

  for mk, mo in select * from jsonb_each(b->'months') loop
    insert into public.months(mk) values (mk);
    for p in select * from jsonb_array_elements(coalesce(mo->'people', '[]'::jsonb)) loop
      insert into public.people(id, sno, name, designation) values (p->>'id', coalesce((p->>'sno')::int, 0), coalesce(p->>'name', ''), coalesce(p->>'designation', ''))
      on conflict (id) do nothing;
      insert into public.month_people(mk, person_id, sno, name, designation)
      values (mk, p->>'id', coalesce((p->>'sno')::int, 0), coalesce(p->>'name', ''), coalesce(p->>'designation', ''));
      i := 0;
      for k in select * from jsonb_array_elements(coalesce(p->'kpis', '[]'::jsonb)) loop
        insert into public.kpis(mk, id, person_id, pos, name, freq, uom, monthly, min, prorate, agg, lower, weight, na, approval,
                                module, meet_rule, meet_kw, need_mom, per_day_ov, till_ov)
        values (mk, k->>'id', p->>'id', i, coalesce(k->>'name', ''), coalesce(nullif(k->>'freq', ''), 'Monthly'), coalesce(nullif(k->>'uom', ''), 'Nos'),
                coalesce(nullif(k->>'monthly', '')::numeric, 0), coalesce(nullif(k->>'min', '')::numeric, 0),
                coalesce((k->>'prorate')::boolean, false), case when k->>'agg' = 'latest' then 'latest' else 'sum' end,
                coalesce((k->>'lower')::boolean, false), coalesce(nullif(k->>'weight', '')::numeric, 1),
                coalesce((k->>'na')::boolean, false), coalesce((k->>'approval')::boolean, false),
                coalesce(nullif(k->>'module', ''), ''), coalesce(k->>'meetRule', ''), k->>'meetKw', coalesce((k->>'needMom')::boolean, false),
                nullif(k->>'perDayOv', '')::numeric, nullif(k->>'tillOv', '')::numeric);
        i := i + 1; n_k := n_k + 1;
      end loop;
    end loop;
  end loop;

  for dkey, dv in select * from jsonb_each(coalesce(b->'log', '{}'::jsonb)) loop
    for kid in select jsonb_object_keys(dv) loop
      if (dv->kid->>'ach') is null or (dv->kid->>'ach') = '' then continue; end if;
      insert into public.daily_log(kpi_id, d, person_id, ach)
      select kid, dkey::date, k2.person_id, (dv->kid->>'ach')::numeric
      from public.kpis k2 where k2.id = kid and k2.mk = left(dkey, 7)
      on conflict do nothing;
      n_l := n_l + 1;
    end loop;
  end loop;

  for mk, mo in select * from jsonb_each(coalesce(b->'remarks', '{}'::jsonb)) loop
    for kid in select jsonb_object_keys(mo) loop
      insert into public.remarks(mk, kpi_id, person_id, text)
      select mk, kid, k2.person_id, mo->>kid from public.kpis k2 where k2.id = kid and k2.mk = mk
      on conflict do nothing;
    end loop;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(b->'entries', '[]'::jsonb)) loop
    if e->>'cgId' is not null then continue; end if;  -- goal-progress logs arrive with the Goals module
    insert into public.entries(id, person_id, by_person, d, kid, activity, qty, link, status, due, blocker, next, goal_id, todo_id,
                               reviewed_by, reviewed_at, edited_by, edited_at)
    select coalesce(e->>'id', gen_random_uuid()::text),
           coalesce(nullif(e->>'pid', ''), (select person_id from public.kpis where id = e->>'kid' limit 1)),
           (select id from public.people where id = e->>'by'),
           (e->>'date')::date, coalesce(e->>'kid', '__other'), coalesce(e->>'activity', ''), nullif(e->>'qty', '')::numeric,
           coalesce(e->>'link', ''), coalesce(nullif(e->>'status', ''), 'Completed'), nullif(e->>'due', '')::date,
           coalesce(e->>'blocker', ''), coalesce(e->>'next', ''), nullif(e->>'goalId', ''), nullif(e->>'todoId', ''),
           e->>'reviewedBy', nullif(e->>'reviewedAt', '')::timestamptz, e->>'editedBy', nullif(e->>'editedAt', '')::timestamptz
    where coalesce(nullif(e->>'pid', ''), (select person_id from public.kpis where id = e->>'kid' limit 1)) in (select id from public.people)
    on conflict (id) do nothing;
    n_e := n_e + 1;
  end loop;

  for s_pid, dv in select * from jsonb_each(coalesce(b->'submissions', '{}'::jsonb)) loop
    if not exists (select 1 from public.people where id = s_pid) then continue; end if;
    for s_day in select jsonb_object_keys(dv) loop
      insert into public.submissions(person_id, d, at, by_person)
      values (s_pid, s_day::date, coalesce(nullif(dv->s_day->>'at', '')::timestamptz, now()), dv->s_day->>'by')
      on conflict do nothing;
    end loop;
  end loop;

  if b->'calendar' is not null then
    update public.settings set value = b->'calendar' where key = 'calendar';
  end if;
  if b->>'remindAt' is not null then
    update public.settings set value = to_jsonb(b->>'remindAt') where key = 'remind_at';
  end if;

  if not bootstrap then
    perform public.log_audit('Data restored', format('Imported backup: %s KPIs, %s daily figures, %s Daily Brief entries', n_k, n_l, n_e));
  end if;
  return jsonb_build_object('kpis', n_k, 'log', n_l, 'entries', n_e);
end $$;

-- Realtime: publish changes so other signed-in users see updates live.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kpis, public.daily_log, public.entries, public.submissions,
      public.month_people, public.months, public.people, public.settings, public.remarks;
  end if;
end $$;

revoke execute on function public.import_backup(jsonb) from anon;
revoke execute on function public.add_entry(jsonb), public.set_entry_status(text, text), public.update_entry(text, jsonb),
  public.delete_entry(text), public.create_month(text, text), public.log_audit(text, text) from anon;

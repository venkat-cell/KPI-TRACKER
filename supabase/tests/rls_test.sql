\set ON_ERROR_STOP 1
-- bootstrap import as postgres
select public.import_backup(pg_read_file('/home/claude/repo/supabase/seed/initial_backup.json')::jsonb);
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
update people set auth_uid='00000000-0000-0000-0000-00000000000a', login_email='mgmt@x' where id='mgmt';
update people set auth_uid='00000000-0000-0000-0000-00000000000b', login_email='o3@x' where id='o3';   -- BALAJI, normal
update people set auth_uid='00000000-0000-0000-0000-00000000000c', login_email='p1@x' where id='p1';   -- VENKAT, view_all
update kpis set approval=true where id='k3_2';
-- second import now refused for non-mgmt
\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select 'official kpis visible' t, count(distinct person_id) from kpis;
select public.import_backup('{"months":{}}');
update kpis set monthly=999 where id='k3_1'; select 'monthly after official update', monthly from kpis where id='k3_1';
insert into daily_log(kpi_id,d,person_id,ach) values ('k3_1','2026-11-03','o3',5);
insert into daily_log(kpi_id,d,person_id,ach) values ('k2_1','2026-11-03','o2',5);
select (public.add_entry('{"person_id":"o3","kid":"k3_1","d":"2026-11-04","qty":"2","activity":"review"}')).status;
select (public.add_entry('{"person_id":"o3","kid":"k3_2","d":"2026-11-04","qty":"1","activity":"appraisal"}')).status as approval_kpi;
select public.add_entry('{"person_id":"o2","kid":"k2_1","d":"2026-11-04","qty":"1"}');
select kpi_id, d, ach from daily_log order by 1,2;
select id from entries where kid='k3_2' \gset
select (public.set_entry_status(:'id','Completed')).status as official_tries_complete;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select 'venkat sees persons', count(distinct person_id) from kpis;
select public.add_entry('{"person_id":"o3","kid":"k3_1","d":"2026-11-04","qty":"1"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select (public.set_entry_status(:'id','Completed')).status as mgmt_approves;
select kpi_id, d, ach from daily_log order by 1,2;
select public.create_month('2026-12','2026-11'); select count(*) dec_kpis from kpis where mk='2026-12';
select by_name, action, detail from audit_log;
reset role;

# Pillars KPI Portal — React + Supabase

This turns the Claude Design prototype (`project/KPI Portal.dc.html`) into a shared, multi-user web app.
Officials and management now share one live database instead of separate browser copies.

## What's built (pass 1 — core)

| Area | Status |
|---|---|
| Sign in (name + password), roles enforced in the database | ✅ |
| KPI sheet: Excel-style table, frozen columns, full screen, cards view on phones, Edit KPIs | ✅ |
| Calculation engine (working days, per day / period, target till date, weighted score, ▼ alerts) | ✅ ported rule-for-rule |
| Daily submission log + reminder banner | ✅ |
| Performance section (Daily … 5 Years, From–To; observations & recommendations) | ✅ |
| Daily Brief (add / edit / delete, approval flow, Drive link viewer, view by date) | ✅ |
| Team overview (management): attainment, critical action list, submission register | ✅ |
| Team & logins, working calendar, scoring settings, audit log | ✅ |
| Excel export with live formulas, PDF (print), backup, import of a standalone-portal backup | ✅ |
| Home org chart, Goals cascade, Strategy roadmap, Todo, Meeting Hub, Learning, Report | ⏳ later passes |

KPIs linked to Meeting Hub or Goals show "Not due" until those modules arrive.

## Access rules (enforced by Postgres row-level security)

* **Officials** read and write only their own KPIs, daily figures, Daily Brief and submissions.
* **"Sees all" officials** (Venkat, C. Pradeep, A. Krishna Prakash) can read everyone, but write only their own.
* **Management** reads and writes everything, sets targets, approves entries, manages logins.
* Targets / weights / min % can only be changed by management.
* Daily Brief writes go through database functions, so "needs approval" KPIs always go to *Pending approval* for officials.

## Layout

```
app/                         Vite + React + TypeScript front end
  src/lib/engine.ts          the single calculation engine
  src/lib/data.ts            Supabase loading + writes
  src/views/                 KPI page, Daily Brief, Overview, dialogs
supabase/migrations/         schema, RLS policies, RPCs
supabase/functions/admin-users/  management-only login admin (edge function)
supabase/seed/initial_backup.json  the 14 officials + their November 2026 KPIs (from the prototype)
supabase/tests/              local RLS test (plain Postgres)
```

## Setup

1. Create a Supabase project. Apply `supabase/migrations/*.sql`, then deploy `supabase/functions/admin-users`.
2. Load the starting data (as the postgres user, before anyone has a login):
   `select public.import_backup('<contents of supabase/seed/initial_backup.json>'::jsonb);`
   — or import your own standalone-portal backup JSON instead.
3. Create logins: insert a one-time code `insert into bootstrap_codes values ('<random>');` and call the
   `admin-users` function with `{"action":"bootstrap","code":"<random>"}`. It returns a generated password per person.
   After that, management resets passwords under **Team & logins**.
4. In Supabase Auth settings, turn off public sign-ups (logins are created by management only).
5. `cd app && cp .env.example .env` and fill in the URL and anon key; `npm install && npm run dev`.
6. Deploy `app/` to Vercel (framework: Vite, env vars as above).

## Tests

`supabase/tests/rls_test.sql` runs against a local Postgres 16 with `local_auth_stub.sql` and checks:
officials can't see or edit others, can't change targets, approval KPIs go to Pending approval,
management approval updates the sheet, and month creation copies KPIs.

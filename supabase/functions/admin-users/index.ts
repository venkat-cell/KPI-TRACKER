// admin-users — management-only login administration for the Pillars KPI Portal.
//
//   POST { action: "set_password", person_id, password }  → creates the person's login if needed, sets the password
//   POST { action: "remove_login", person_id }             → deletes the person's login (their KPI data stays)
//   POST { action: "bootstrap", code }                     → one time: creates logins for everyone with generated
//                                                             passwords. `code` must exist in public.bootstrap_codes.
//
// Officials sign in with their name (picked from a list) and password; the app maps the name to the
// synthetic login e-mail stored in people.login_email.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const emailFor = (id: string) => `${id.toLowerCase().replace(/[^a-z0-9]/g, "")}@pillars-kpi.app`;
const genPassword = () => {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, (x) => a[x % a.length]).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  async function ensureLogin(personId: string, password: string) {
    const { data: p, error } = await admin.from("people").select("id, name, auth_uid").eq("id", personId).single();
    if (error || !p) throw new Error("Person not found");
    const email = emailFor(p.id);
    if (p.auth_uid) {
      const { error: e2 } = await admin.auth.admin.updateUserById(p.auth_uid, { password });
      if (e2) throw e2;
    } else {
      const { data, error: e2 } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { person_id: p.id, name: p.name } });
      if (e2) throw e2;
      const { error: e3 } = await admin.from("people").update({ auth_uid: data.user.id, login_email: email }).eq("id", p.id);
      if (e3) throw e3;
    }
    return { id: p.id, name: p.name, email };
  }

  async function audit(byName: string, byPerson: string | null, action: string, detail: string) {
    await admin.from("audit_log").insert({ by_name: byName, by_person: byPerson, action, detail });
  }

  try {
    if (body.action === "bootstrap") {
      const code = String(body.code || "");
      const { data: c } = await admin.from("bootstrap_codes").select("code").eq("code", code).maybeSingle();
      if (!code || !c) return json({ error: "Invalid bootstrap code" }, 403);
      await admin.from("bootstrap_codes").delete().eq("code", code);
      const { data: people } = await admin.from("people").select("id, name, sno, role").eq("active", true).is("auth_uid", null).order("sno");
      const out = [];
      for (const p of people || []) {
        const password = genPassword();
        const r = await ensureLogin(p.id, password);
        out.push({ ...r, role: p.role, password });
      }
      await audit("System", null, "Logins created", `${out.length} logins created at setup`);
      return json({ created: out });
    }

    // every other action needs a signed-in management user
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Sign in first" }, 401);
    const { data: me } = await admin.from("people").select("id, name, role, active").eq("auth_uid", u.user.id).maybeSingle();
    if (!me || me.role !== "management" || !me.active) return json({ error: "Only management can manage logins" }, 403);

    if (body.action === "set_password") {
      const pw = String(body.password || "");
      if (pw.length < 6) return json({ error: "Use at least 6 characters" }, 400);
      const r = await ensureLogin(String(body.person_id), pw);
      await audit(me.name, me.id, "Password set", r.name);
      return json({ ok: true, email: r.email });
    }
    if (body.action === "remove_login") {
      const { data: p } = await admin.from("people").select("id, name, auth_uid").eq("id", String(body.person_id)).single();
      if (!p) return json({ error: "Person not found" }, 404);
      if (p.id === me.id) return json({ error: "You can't remove your own login" }, 400);
      if (p.auth_uid) {
        await admin.from("people").update({ auth_uid: null, login_email: null }).eq("id", p.id);
        await admin.auth.admin.deleteUser(p.auth_uid);
      }
      await audit(me.name, me.id, "Login removed", p.name);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});

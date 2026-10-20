"use server";

import { revalidatePath } from "next/cache";
import { currentPlatformAdmin, supabaseAdmin } from "@/lib/supabase/server";

export async function updateWorkspace(form: FormData) {
  const { user, isAdmin } = await currentPlatformAdmin();
  if (!user || !isAdmin) throw new Error("Platform administrator access required.");
  const orgId = String(form.get("org_id") || "");
  const status = String(form.get("status") || "");
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !["active", "past_due", "suspended"].includes(status)) throw new Error("Invalid workspace update.");
  const admin = supabaseAdmin();
  if (!admin) throw new Error("Supabase service role is not configured.");
  const { data: current } = await admin.from("organizations").select("status").eq("id", orgId).maybeSingle();
  if (!current) throw new Error("Workspace not found.");
  const { error } = await admin.from("organizations").update({ status, updated_at: new Date().toISOString() }).eq("id", orgId);
  if (error) throw new Error(error.message);
  const { error: auditError } = await admin.from("platform_audit_log").insert({ actor_id: user.id, org_id: orgId, action: "workspace_status_changed", details: { from: current.status, to: status } });
  if (auditError) throw new Error(auditError.message);
  revalidatePath("/admin");
}

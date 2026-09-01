import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MyActions from "./MyActions";

export default async function MyActionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, prsRes, rolesRes, slaRes, cancelRequestsRes, changeRequestsRes] = await Promise.all([
    supabase.from("profiles").select("id, name, is_admin, is_purchasing").eq("id", user.id).single(),
    supabase
      .from("purchase_requisitions")
      .select("*, projects(name, code), suppliers(name), requester:profiles!requester_id(name)")
      .order("created_at", { ascending: false }),
    supabase.from("project_roles").select("project_id, user_id, role"),
    supabase.from("sla_settings").select("*").eq("id", 1).single(),
    supabase.from("pr_cancellation_requests").select("*").in("status", ["pending_purchaser", "pending_admin"]),
    supabase.from("pr_change_requests").select("*").eq("status", "pending"),
  ]);

  return (
    <MyActions
      profile={profileRes.data}
      prs={prsRes.data || []}
      allProjectRoles={rolesRes.data || []}
      sla={slaRes.data || { verify_days: 0, approve_days: 0, po_days: 0 }}
      cancelRequests={cancelRequestsRes.data || []}
      changeRequests={changeRequestsRes.data || []}
    />
  );
}

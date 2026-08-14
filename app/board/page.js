import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Board from "./Board";

export default async function BoardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, prsRes, projectsRes, suppliersRes, uomsRes, allProjectRolesRes, slaRes, cancelRequestsRes, changeRequestsRes] = await Promise.all([
    supabase.from("profiles").select("id, name, is_admin, is_purchasing").eq("id", user.id).single(),
    supabase
      .from("purchase_requisitions")
      .select("*, projects(name, code), suppliers(name), verifier:profiles!verified_by(name), approver:profiles!approved_by(name), requester:profiles!requester_id(name)")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name, code").order("name"),
    supabase.from("suppliers").select("id, name, status").order("name"),
    supabase.from("uoms").select("id, name").order("name"),
    supabase.from("project_roles").select("project_id, user_id, role"),
    supabase.from("sla_settings").select("*").eq("id", 1).single(),
    supabase.from("pr_cancellation_requests").select("*").in("status", ["pending_purchaser", "pending_admin"]),
    supabase.from("pr_change_requests").select("*").eq("status", "pending"),
  ]);

  const allProjectRoles = allProjectRolesRes.data || [];
  // Everyone can raise a requisition on any project (item 1.5), so the
  // eligible list is simply every project.
  const eligibleProjects = projectsRes.data || [];

  return (
    <Board
      profile={profileRes.data}
      initialPrs={prsRes.data || []}
      allProjects={projectsRes.data || []}
      eligibleProjects={eligibleProjects}
      suppliers={suppliersRes.data || []}
      uoms={uomsRes.data || []}
      allProjectRoles={allProjectRoles}
      sla={slaRes.data || { verify_days: 0, approve_days: 0, po_days: 0 }}
      initialCancelRequests={cancelRequestsRes.data || []}
      initialChangeRequests={changeRequestsRes.data || []}
    />
  );
}

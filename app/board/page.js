import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Board from "./Board";

export default async function BoardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, prsRes, projectsRes, suppliersRes, uomsRes, requesterRolesRes, allRequesterRolesRes] =
    await Promise.all([
      supabase.from("profiles").select("id, name, is_admin, is_purchasing").eq("id", user.id).single(),
      supabase
        .from("purchase_requisitions")
        .select("*, projects(name, code), suppliers(name)")
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name, code").order("name"),
      supabase.from("suppliers").select("id, name").order("name"),
      supabase.from("uoms").select("id, name").order("name"),
      supabase.from("project_roles").select("project_id").eq("user_id", user.id).eq("role", "requester"),
      supabase.from("project_roles").select("project_id").eq("role", "requester"),
    ]);

  const myRequesterProjectIds = new Set((requesterRolesRes.data || []).map((r) => r.project_id));
  const projectsWithAnyRequester = new Set((allRequesterRolesRes.data || []).map((r) => r.project_id));
  const eligibleProjects = (projectsRes.data || []).filter(
    (p) => myRequesterProjectIds.has(p.id) || !projectsWithAnyRequester.has(p.id)
  );

  return (
    <Board
      profile={profileRes.data}
      initialPrs={prsRes.data || []}
      allProjects={projectsRes.data || []}
      eligibleProjects={eligibleProjects}
      suppliers={suppliersRes.data || []}
      uoms={uomsRes.data || []}
    />
  );
}

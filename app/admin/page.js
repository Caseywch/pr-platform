import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminPanel from "./AdminPanel";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  const [profiles, projects, projectRoles, suppliers, uoms, sla] = await Promise.all([
    supabase.from("profiles").select("id, name, email, is_admin, is_purchasing").order("name"),
    supabase.from("projects").select("id, name, code").order("name"),
    supabase.from("project_roles").select("project_id, user_id, role"),
    supabase.from("suppliers").select("id, name, status").order("name"),
    supabase.from("uoms").select("id, name").order("name"),
    supabase.from("sla_settings").select("*").eq("id", 1).single(),
  ]);

  return (
    <AdminPanel
      initialProfiles={profiles.data || []}
      initialProjects={projects.data || []}
      initialProjectRoles={projectRoles.data || []}
      initialSuppliers={suppliers.data || []}
      initialUoms={uoms.data || []}
      initialSla={sla.data || { verify_days: 2, approve_days: 2, po_days: 2 }}
    />
  );
}

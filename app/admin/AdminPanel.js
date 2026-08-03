"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "../Logo";
import UsersTab from "./UsersTab";
import PendingTab from "./PendingTab";

const TABS = [
  { id: "users", label: "Users" },
  { id: "projects", label: "Projects & Roles" },
  { id: "suppliers", label: "Suppliers" },
  { id: "uoms", label: "UOMs" },
  { id: "sla", label: "Turnaround Times" },
  { id: "pending", label: "Pending Approvals" },
];

const btn = "text-sm px-3 py-1.5 rounded-md";
const input = "border border-neutral-300 rounded-md px-3 py-2 text-sm";
const card = "bg-white border border-neutral-200 rounded-lg p-5";

export default function AdminPanel({
  initialProfiles,
  initialProjects,
  initialProjectRoles,
  initialSuppliers,
  initialUoms,
  initialSla,
}) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState("users");
  const [profiles, setProfiles] = useState(initialProfiles);
  const [projects, setProjects] = useState(initialProjects);
  const [projectRoles, setProjectRoles] = useState(initialProjectRoles);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [uoms, setUoms] = useState(initialUoms);
  const [sla, setSla] = useState(initialSla);
  const [error, setError] = useState("");

  const refresh = () => router.refresh();

  const fail = (err) => setError(err?.message || "Something went wrong.");

  const pendingCount = suppliers.filter((s) => s.status === "pending").length;

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <Logo height={36} />
              <div>
                <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
                <h1 className="text-2xl font-bold mt-0.5">Admin Setup</h1>
              </div>
            </div>
          </div>
          <a href="/" className="text-xs underline text-neutral-600">Back to app</a>
        </div>

        {error && <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2 mb-4">{error}</div>}

        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`${btn} ${tab === t.id ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}
            >
              {t.label}
              {t.id === "pending" && pendingCount > 0 && (
                <span
                  className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: "#B23A2E", color: "white" }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <UsersTab supabase={supabase} profiles={profiles} setProfiles={setProfiles} fail={fail} />
        )}
        {tab === "projects" && (
          <ProjectsTab
            supabase={supabase}
            projects={projects}
            setProjects={setProjects}
            profiles={profiles}
            projectRoles={projectRoles}
            setProjectRoles={setProjectRoles}
            fail={fail}
          />
        )}
        {tab === "suppliers" && (
          <ListTab
            supabase={supabase}
            table="suppliers"
            items={suppliers.filter((s) => s.status !== "pending")}
            setItems={setSuppliers}
            label="Supplier"
            fail={fail}
          />
        )}
        {tab === "uoms" && (
          <ListTab supabase={supabase} table="uoms" items={uoms} setItems={setUoms} label="Unit" fail={fail} />
        )}
        {tab === "pending" && (
          <PendingTab supabase={supabase} suppliers={suppliers} setSuppliers={setSuppliers} fail={fail} />
        )}
        {tab === "sla" && <SlaTab supabase={supabase} sla={sla} setSla={setSla} fail={fail} />}
      </div>
    </div>
  );
}

function ProjectsTab({ supabase, projects, setProjects, profiles, projectRoles, setProjectRoles, fail }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const [addUserId, setAddUserId] = useState({ requester: "", verifier: "", approver: "" });

  const addProject = async () => {
    if (!name.trim() || !code.trim()) return;
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: name.trim(), code: code.trim() })
      .select()
      .single();
    if (error) return fail(error);
    setProjects([...projects, data].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
    setCode("");
    if (!selectedProjectId) setSelectedProjectId(data.id);
  };

  const removeProject = async (id) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return fail(error);
    setProjects(projects.filter((p) => p.id !== id));
    setProjectRoles(projectRoles.filter((r) => r.project_id !== id));
  };

  const rolesFor = (role) => projectRoles.filter((r) => r.project_id === selectedProjectId && r.role === role);

  const addRole = async (role) => {
    const userId = addUserId[role];
    if (!userId || !selectedProjectId) return;
    const { error } = await supabase.from("project_roles").insert({ project_id: selectedProjectId, user_id: userId, role });
    if (error) return fail(error);
    setProjectRoles([...projectRoles, { project_id: selectedProjectId, user_id: userId, role }]);
    setAddUserId({ ...addUserId, [role]: "" });
  };

  const removeRole = async (role, userId) => {
    const { error } = await supabase
      .from("project_roles")
      .delete()
      .eq("project_id", selectedProjectId)
      .eq("user_id", userId)
      .eq("role", role);
    if (error) return fail(error);
    setProjectRoles(projectRoles.filter((r) => !(r.project_id === selectedProjectId && r.user_id === userId && r.role === role)));
  };

  const nameFor = (userId) => profiles.find((p) => p.id === userId)?.name || "Unknown";

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <div className="text-sm font-bold mb-3">Projects</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input className={input} placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={input} placeholder="Project code" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <button onClick={addProject} className={`${btn} bg-neutral-900 text-white mb-3`}>Add project</button>
        <div className="flex flex-col gap-1.5">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-neutral-50 rounded-md px-3 py-2 text-sm">
              <span>{p.name} <span className="text-neutral-600 text-xs">({p.code})</span></span>
              <button onClick={() => removeProject(p.id)} className="text-xs text-red-600">Remove</button>
            </div>
          ))}
          {projects.length === 0 && <div className="text-sm text-neutral-600">No projects yet.</div>}
        </div>
      </div>

      {projects.length > 0 && (
        <div className={card}>
          <div className="text-sm font-bold mb-3">Role Assignments</div>
          <select className={`${input} w-full mb-4`} value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {["verifier", "approver"].map((role) => (
            <div key={role} className="mb-4">
              <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1.5">{role}s</div>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {rolesFor(role).map((r) => (
                  <span key={r.user_id} className="text-xs bg-neutral-100 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                    {nameFor(r.user_id)}
                    <button onClick={() => removeRole(role, r.user_id)}>×</button>
                  </span>
                ))}
                {rolesFor(role).length === 0 && <span className="text-xs text-neutral-600">Anyone with this role can act (unrestricted).</span>}
              </div>
              <div className="flex gap-2">
                <select
                  className={`${input} flex-1 text-xs`}
                  value={addUserId[role]}
                  onChange={(e) => setAddUserId({ ...addUserId, [role]: e.target.value })}
                >
                  <option value="">Select user…</option>
                  {profiles.filter((p) => !rolesFor(role).some((r) => r.user_id === p.id)).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button onClick={() => addRole(role)} className={`${btn} border border-neutral-300`}>Add</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListTab({ supabase, table, items, setItems, label, fail }) {
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    const { data, error } = await supabase.from(table).insert({ name: name.trim() }).select().single();
    if (error) return fail(error);
    setItems([...items, data].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
  };

  const remove = async (id) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return fail(error);
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className={card}>
      <div className="text-sm font-bold mb-3">{label}s</div>
      <div className="flex gap-2 mb-3">
        <input
          className={`${input} flex-1`}
          placeholder={`Add a ${label.toLowerCase()}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} className={`${btn} bg-neutral-900 text-white`}>Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span key={i.id} className="text-xs bg-neutral-100 rounded-full px-2.5 py-1 flex items-center gap-1.5">
            {i.name}
            <button onClick={() => remove(i.id)}>×</button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-neutral-600">None yet.</span>}
      </div>
    </div>
  );
}

function SlaTab({ supabase, sla, setSla, fail }) {
  const [draft, setDraft] = useState(sla);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const { error } = await supabase
      .from("sla_settings")
      .update({
        verify_days: Number(draft.verify_days) || 0,
        approve_days: Number(draft.approve_days) || 0,
        po_days: Number(draft.po_days) || 0,
      })
      .eq("id", 1);
    if (error) return fail(error);
    setSla(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={card}>
      <div className="text-sm font-bold mb-3">Turnaround Times — Working Days</div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-neutral-600">To Verify</label>
          <input
            type="number" min="0"
            className={`${input} w-full`}
            value={draft.verify_days}
            onChange={(e) => setDraft({ ...draft, verify_days: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-neutral-600">To Approve</label>
          <input
            type="number" min="0"
            className={`${input} w-full`}
            value={draft.approve_days}
            onChange={(e) => setDraft({ ...draft, approve_days: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-neutral-600">To Issue PO</label>
          <input
            type="number" min="0"
            className={`${input} w-full`}
            value={draft.po_days}
            onChange={(e) => setDraft({ ...draft, po_days: e.target.value })}
          />
        </div>
      </div>
      <button onClick={save} className={`${btn} bg-neutral-900 text-white`}>Save</button>
      {saved && <span className="text-xs text-emerald-600 ml-3">Saved.</span>}
    </div>
  );
}

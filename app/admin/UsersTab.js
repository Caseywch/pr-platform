"use client";

import { useState } from "react";

const btn = "text-sm px-3 py-1.5 rounded-md";
const input = "border border-neutral-300 rounded-md px-3 py-2 text-sm";
const card = "bg-white border border-neutral-200 rounded-lg p-5";

export default function UsersTab({ supabase, profiles, setProfiles, fail, router }) {
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPin, setNewPin] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetForId, setResetForId] = useState(null);
  const [resetPin, setResetPin] = useState("");

  const toggle = async (id, field, value) => {
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", id);
    if (error) return fail(error);
    setProfiles(profiles.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const newPinValid = /^[0-9]{6}$/.test(newPin);
  const canCreate = newName.trim() && newEmail.trim() && newPinValid && !creating;

  const createUser = async () => {
    if (!canCreate) return;
    setCreating(true);
    setNotice("");
    const { data, error } = await supabase.rpc("admin_create_user", {
      p_name: newName.trim(),
      p_email: newEmail.trim(),
      p_pin: newPin,
    });
    setCreating(false);
    if (error) return fail(error);
    setProfiles([
      ...profiles,
      { id: data, name: newName.trim(), email: newEmail.trim().toLowerCase(), is_admin: false, is_purchasing: false },
    ]);
    setNotice(`Account created for ${newName.trim()}. Share their PIN with them directly \u2014 it can't be viewed again later.`);
    setNewName("");
    setNewEmail("");
    setNewPin("");
  };

  const resetPinValid = /^[0-9]{6}$/.test(resetPin);

  const doResetPin = async (userId, userName) => {
    if (!resetPinValid) return;
    const { error } = await supabase.rpc("admin_reset_pin", { p_user_id: userId, p_pin: resetPin });
    if (error) return fail(error);
    setNotice(`PIN reset for ${userName}. Share the new PIN with them directly.`);
    setResetForId(null);
    setResetPin("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <div className="text-sm font-bold mb-1">Add a new user</div>
        <div className="text-xs text-neutral-600 mb-3">
          Users can't sign themselves up. Create their account here, then pass them the PIN directly.
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            className={input}
            placeholder="Full name *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            type="email"
            className={input}
            placeholder="Email address *"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
        </div>
        <input
          className={input + " w-full mb-1 tracking-[0.4em]"}
          inputMode="numeric"
          maxLength={6}
          placeholder="6-digit PIN *"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        {newPin && !newPinValid && (
          <div className="text-xs text-red-600 mb-2">PIN must be exactly 6 digits.</div>
        )}
        <button
          onClick={createUser}
          disabled={!canCreate}
          className={`${btn} mt-2`}
          style={{ background: canCreate ? "#171717" : "#d4d4d4", color: "white" }}
        >
          {creating ? "Creating\u2026" : "Create user"}
        </button>
        {notice && (
          <div className="text-xs mt-3 px-3 py-2 rounded-md bg-emerald-50 text-emerald-700">{notice}</div>
        )}
      </div>

    <div className={card}>
      <div className="text-xs text-neutral-600 mb-4">
        Everyone here can raise a purchase requisition. Tick Admin or Purchasing to give extra access.
      </div>
      <div className="flex flex-col gap-2">
        {profiles.map((p) => (
          <div key={p.id}>
          <div className="flex items-center justify-between border border-neutral-200 rounded-md px-3 py-2">
            <div>
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-neutral-600">{p.email}</div>
            </div>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!p.is_admin} onChange={(e) => toggle(p.id, "is_admin", e.target.checked)} />
                Admin
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!p.is_purchasing}
                  onChange={(e) => toggle(p.id, "is_purchasing", e.target.checked)}
                />
                Purchasing
              </label>
              <button
                onClick={() => { setResetForId(resetForId === p.id ? null : p.id); setResetPin(""); }}
                className="underline text-neutral-600"
              >
                Reset PIN
              </button>
            </div>
          </div>
          {resetForId === p.id && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-1.5">
              <div className="text-xs text-neutral-600 mb-2">
                Set a new 6-digit PIN for {p.name}. The old one can't be recovered.
              </div>
              <div className="flex gap-2">
                <input
                  className={input + " text-xs flex-1 tracking-[0.4em]"}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="New 6-digit PIN"
                  value={resetPin}
                  onChange={(e) => setResetPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <button
                  onClick={() => doResetPin(p.id, p.name)}
                  disabled={!resetPinValid}
                  className={`${btn} shrink-0`}
                  style={{ background: resetPinValid ? "#171717" : "#d4d4d4", color: "white" }}
                >
                  Save
                </button>
                <button
                  onClick={() => { setResetForId(null); setResetPin(""); }}
                  className={`${btn} border border-neutral-300 shrink-0`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          </div>
        ))}
        {profiles.length === 0 && <div className="text-sm text-neutral-600">No users yet. Add one above.</div>}
      </div>
    </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB per file

const input = "border border-neutral-300 rounded-md px-3 py-2 text-sm";

function uid() {
  return crypto.randomUUID();
}

/* ---------- Picker used inside the New PR form ---------- */
export function AttachmentPicker({ quotationFiles, setQuotationFiles, budgetComparisonFiles, setBudgetComparisonFiles, drawings, setDrawings, photos, setPhotos, onError }) {
  const addQuotation = (fileList) => {
    const files = Array.from(fileList);
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) return onError(`"${f.name}" is over the 20MB limit.`);
    }
    setQuotationFiles([...quotationFiles, ...files]);
  };
  const addBudgetComparison = (fileList) => {
    const files = Array.from(fileList);
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) return onError(`"${f.name}" is over the 20MB limit.`);
    }
    setBudgetComparisonFiles([...budgetComparisonFiles, ...files]);
  };
  const addDrawing = (fileList) => {
    const files = Array.from(fileList);
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) return onError(`"${f.name}" is over the 20MB limit.`);
    }
    setDrawings([...drawings, ...files.map((f) => ({ id: uid(), file: f, drawingNumber: "", revisionNo: "" }))]);
  };
  const addPhotos = (fileList) => {
    const files = Array.from(fileList);
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) return onError(`"${f.name}" is over the 20MB limit.`);
    }
    setPhotos([...photos, ...files.map((f) => ({ id: uid(), file: f, preview: URL.createObjectURL(f) }))]);
  };
  const updateDrawing = (id, field, val) => setDrawings(drawings.map((d) => (d.id === id ? { ...d, [field]: val } : d)));
  const drawingsIncomplete = drawings.some((d) => !d.drawingNumber.trim() || !d.revisionNo.trim());

  return (
    <>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1.5">Supplier's Quotation (PDF, optional)</div>
        {quotationFiles.map((f, i) => (
          <div key={i} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md mb-1.5 bg-neutral-50 border border-neutral-200">
            <span className="truncate">{f.name}</span>
            <button onClick={() => setQuotationFiles(quotationFiles.filter((_, idx) => idx !== i))} className="text-red-600 shrink-0 ml-2">Remove</button>
          </div>
        ))}
        <label className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer border border-dashed border-neutral-300 text-neutral-600">
          + Upload PDF
          <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => e.target.files.length && addQuotation(e.target.files)} />
        </label>
      </div>

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1.5">Budget Comparison (PDF, optional)</div>
        {budgetComparisonFiles.map((f, i) => (
          <div key={i} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md mb-1.5 bg-neutral-50 border border-neutral-200">
            <span className="truncate">{f.name}</span>
            <button onClick={() => setBudgetComparisonFiles(budgetComparisonFiles.filter((_, idx) => idx !== i))} className="text-red-600 shrink-0 ml-2">Remove</button>
          </div>
        ))}
        <label className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer border border-dashed border-neutral-300 text-neutral-600">
          + Upload PDF
          <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => e.target.files.length && addBudgetComparison(e.target.files)} />
        </label>
      </div>

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1.5">Approved Production Drawing (PDF, optional)</div>
        {drawings.map((d) => (
          <div key={d.id} className="rounded-md p-2.5 mb-1.5 bg-neutral-50 border border-neutral-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs truncate">{d.file.name}</span>
              <button onClick={() => setDrawings(drawings.filter((x) => x.id !== d.id))} className="text-red-600 shrink-0 ml-2">Remove</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={input + " text-xs"} placeholder="Drawing Number *" value={d.drawingNumber} onChange={(e) => updateDrawing(d.id, "drawingNumber", e.target.value)} />
              <input className={input + " text-xs"} placeholder="Revision No *" value={d.revisionNo} onChange={(e) => updateDrawing(d.id, "revisionNo", e.target.value)} />
            </div>
          </div>
        ))}
        <label className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer border border-dashed border-neutral-300 text-neutral-600">
          + Upload PDF
          <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => e.target.files.length && addDrawing(e.target.files)} />
        </label>
        {drawings.length > 0 && drawingsIncomplete && (
          <div className="text-xs text-red-600 mt-1">Every uploaded drawing needs a Drawing Number and Revision No.</div>
        )}
      </div>

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1.5">Photos (optional)</div>
        <div className="flex flex-wrap gap-2 mb-1.5">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              <img src={p.preview} alt={p.file.name} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid #d4d4d4" }} />
              <button
                onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}
                className="absolute rounded-full flex items-center justify-center bg-neutral-900"
                style={{ top: -5, right: -5, width: 16, height: 16 }}
              >
                <span className="text-white text-[10px] leading-none">×</span>
              </button>
            </div>
          ))}
        </div>
        <label className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer border border-dashed border-neutral-300 text-neutral-600">
          + Upload photo
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files.length && addPhotos(e.target.files)} />
        </label>
      </div>
    </>
  );
}

/* ---------- Actually push files to Storage + create pr_attachments rows ---------- */
export async function uploadAttachments(supabase, prId, { quotationFiles, budgetComparisonFiles = [], drawings, photos }) {
  const rows = [];

  for (const file of quotationFiles) {
    const path = `${prId}/quotation/${uid()}-${file.name}`;
    const { error } = await supabase.storage.from("pr-attachments").upload(path, file);
    if (error) throw new Error(`Uploading "${file.name}": ${error.message}`);
    rows.push({ pr_id: prId, category: "quotation", filename: file.name, storage_path: path });
  }

  for (const file of budgetComparisonFiles) {
    const path = `${prId}/budget_comparison/${uid()}-${file.name}`;
    const { error } = await supabase.storage.from("pr-attachments").upload(path, file);
    if (error) throw new Error(`Uploading "${file.name}": ${error.message}`);
    rows.push({ pr_id: prId, category: "budget_comparison", filename: file.name, storage_path: path });
  }

  for (const d of drawings) {
    const path = `${prId}/drawing/${uid()}-${d.file.name}`;
    const { error } = await supabase.storage.from("pr-attachments").upload(path, d.file);
    if (error) throw new Error(`Uploading "${d.file.name}": ${error.message}`);
    rows.push({
      pr_id: prId,
      category: "drawing",
      filename: d.file.name,
      storage_path: path,
      drawing_number: d.drawingNumber.trim(),
      revision_no: d.revisionNo.trim(),
    });
  }

  for (const p of photos) {
    const path = `${prId}/photo/${uid()}-${p.file.name}`;
    const { error } = await supabase.storage.from("pr-attachments").upload(path, p.file);
    if (error) throw new Error(`Uploading "${p.file.name}": ${error.message}`);
    rows.push({ pr_id: prId, category: "photo", filename: p.file.name, storage_path: path });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("pr_attachments").insert(rows);
    if (error) throw new Error(`Saving attachment records: ${error.message}`);
  }
}

/* ---------- Copy an existing PR's attachments onto a newly-created duplicate PR ----------
   Unlike uploadAttachments (which takes local File objects the user just picked), this copies
   files that already live in Storage: download the original bytes, re-upload under the new
   PR's own path, and insert a matching pr_attachments row. Used by "Duplicate a PR". */
export async function duplicateAttachments(supabase, sourcePrId, newPrId, excludedIds) {
  const { data: sourceAttachments, error: fetchError } = await supabase
    .from("pr_attachments")
    .select("*")
    .eq("pr_id", sourcePrId);
  if (fetchError) throw new Error(`Reading original attachments: ${fetchError.message}`);
  if (!sourceAttachments || sourceAttachments.length === 0) return;

  const toCopy = excludedIds && excludedIds.size > 0
    ? sourceAttachments.filter((a) => !excludedIds.has(a.id))
    : sourceAttachments;
  if (toCopy.length === 0) return;

  const rows = [];
  for (const a of toCopy) {
    const { data: fileBlob, error: downloadError } = await supabase.storage.from("pr-attachments").download(a.storage_path);
    if (downloadError) throw new Error(`Copying "${a.filename}": ${downloadError.message}`);
    const newPath = `${newPrId}/${a.category}/${uid()}-${a.filename}`;
    const { error: uploadError } = await supabase.storage.from("pr-attachments").upload(newPath, fileBlob);
    if (uploadError) throw new Error(`Copying "${a.filename}": ${uploadError.message}`);
    rows.push({
      pr_id: newPrId,
      category: a.category,
      filename: a.filename,
      storage_path: newPath,
      drawing_number: a.drawing_number,
      revision_no: a.revision_no,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("pr_attachments").insert(rows);
    if (error) throw new Error(`Saving copied attachment records: ${error.message}`);
  }
}


export async function openStoredFile(supabase, path) {
  const { data, error } = await supabase.storage.from("pr-attachments").createSignedUrl(path, 60);
  if (error || !data) {
    window.alert("Couldn't open this file.");
    return;
  }
  window.open(data.signedUrl, "_blank");
}

/* ---------- Editable display of already-uploaded attachments (Edit form, rejected PRs only) ----------
   Deletes both the storage object and the pr_attachments row. If either delete is blocked by RLS
   (e.g. this PR is no longer rejected, or the viewer isn't the Requester/Admin), Supabase won't error —
   it just matches zero rows — so we re-fetch afterwards and compare counts to catch that silently. */
export function ExistingAttachmentsEditor({ supabase, prId, onError }) {
  const [attachments, setAttachments] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  const load = async () => {
    const { data } = await supabase.from("pr_attachments").select("*").eq("pr_id", prId).order("uploaded_at");
    setAttachments(data || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prId, supabase]);

  const remove = async (file) => {
    setRemovingId(file.id);
    const { error: storageError } = await supabase.storage.from("pr-attachments").remove([file.storage_path]);
    const { data: deletedRows, error: dbError } = await supabase
      .from("pr_attachments")
      .delete()
      .eq("id", file.id)
      .select();
    setRemovingId(null);
    if (storageError || dbError) {
      onError((storageError || dbError).message);
      return;
    }
    if (!deletedRows || deletedRows.length === 0) {
      onError("Couldn't remove this file — you may no longer have permission to edit this requisition.");
      return;
    }
    await load();
  };

  if (!attachments || attachments.length === 0) return null;

  const quotations = attachments.filter((a) => a.category === "quotation");
  const budgetComparisons = attachments.filter((a) => a.category === "budget_comparison");
  const drawings = attachments.filter((a) => a.category === "drawing");
  const photos = attachments.filter((a) => a.category === "photo");

  const RemoveBtn = ({ file }) => (
    <button
      type="button"
      onClick={() => remove(file)}
      disabled={removingId === file.id}
      className="text-red-600 shrink-0 ml-2 text-xs disabled:opacity-50"
    >
      {removingId === file.id ? "Removing…" : "Remove"}
    </button>
  );

  return (
    <div className="mb-3">
      <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1.5">Existing attachments</div>
      {quotations.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-1.5">
          {quotations.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md bg-neutral-50 border border-neutral-200">
              <button type="button" onClick={() => openStoredFile(supabase, f.storage_path)} className="truncate text-left">{f.filename}</button>
              <RemoveBtn file={f} />
            </div>
          ))}
        </div>
      )}
      {budgetComparisons.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-1.5">
          {budgetComparisons.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md bg-neutral-50 border border-neutral-200">
              <button type="button" onClick={() => openStoredFile(supabase, f.storage_path)} className="truncate text-left">{f.filename}</button>
              <RemoveBtn file={f} />
            </div>
          ))}
        </div>
      )}
      {drawings.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-1.5">
          {drawings.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md bg-neutral-50 border border-neutral-200">
              <button type="button" onClick={() => openStoredFile(supabase, d.storage_path)} className="truncate text-left">
                {d.filename} <span className="text-neutral-600">· Dwg {d.drawing_number} · Rev {d.revision_no}</span>
              </button>
              <RemoveBtn file={d} />
            </div>
          ))}
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              <PhotoThumb supabase={supabase} file={p} />
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={removingId === p.id}
                className="absolute rounded-full flex items-center justify-center bg-neutral-900 disabled:opacity-50"
                style={{ top: -5, right: -5, width: 16, height: 16 }}
              >
                <span className="text-white text-[10px] leading-none">×</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Read-only display in the expanded PR card ---------- */
export function AttachmentsDisplay({ supabase, prId }) {
  const [attachments, setAttachments] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("pr_attachments").select("*").eq("pr_id", prId).order("uploaded_at");
      if (alive) setAttachments(data || []);
    })();
    return () => { alive = false; };
  }, [prId, supabase]);

  if (!attachments || attachments.length === 0) return null;

  const quotations = attachments.filter((a) => a.category === "quotation");
  const budgetComparisons = attachments.filter((a) => a.category === "budget_comparison");
  const drawings = attachments.filter((a) => a.category === "drawing");
  const photos = attachments.filter((a) => a.category === "photo");

  return (
    <div className="mb-3">
      <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1.5">Attachments</div>
      {quotations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {quotations.map((f) => (
            <button key={f.id} onClick={() => openStoredFile(supabase, f.storage_path)} className="text-xs px-2 py-1 rounded-md border border-neutral-300 print-keep">
              {f.filename}
            </button>
          ))}
        </div>
      )}
      {budgetComparisons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {budgetComparisons.map((f) => (
            <button key={f.id} onClick={() => openStoredFile(supabase, f.storage_path)} className="text-xs px-2 py-1 rounded-md border border-neutral-300 print-keep">
              {f.filename}
            </button>
          ))}
        </div>
      )}
      {drawings.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-1.5">
          {drawings.map((d) => (
            <button key={d.id} onClick={() => openStoredFile(supabase, d.storage_path)} className="text-xs px-2 py-1 rounded-md border border-neutral-300 w-fit print-keep">
              {d.filename} <span className="text-neutral-600">· Dwg {d.drawing_number} · Rev {d.revision_no}</span>
            </button>
          ))}
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => <PhotoThumb key={p.id} supabase={supabase} file={p} />)}
        </div>
      )}
    </div>
  );
}

function PhotoThumb({ supabase, file }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.storage.from("pr-attachments").createSignedUrl(file.storage_path, 300);
      if (alive && data) setSrc(data.signedUrl);
    })();
    return () => { alive = false; };
  }, [file.storage_path, supabase]);

  return (
    <button
      onClick={() => openStoredFile(supabase, file.storage_path)}
      className="rounded-md overflow-hidden shrink-0 bg-neutral-50 border border-neutral-300"
      style={{ width: 56, height: 56 }}
      title={file.filename}
    >
      {src && <img src={src} alt={file.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    </button>
  );
}

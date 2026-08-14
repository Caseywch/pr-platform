"use client";

// Builds and downloads a single-PR .xlsx export, laid out to mirror the PDF
// form (Basic Information, item table, attachment list, Purchasing &
// Delivery Record) but WITHOUT the signature block — Excel isn't for
// signing, so Requested/Verified/Approved by are intentionally left out.

import * as XLSX from "xlsx";

export function exportPrAsExcel(pr, items = [], attachments = [], deliveries = []) {
  const rows = [];

  rows.push(["FEDERAL FURNITURE (1982) SDN BHD"]);
  rows.push(["PURCHASE REQUISITION FORM"]);
  rows.push([]);

  rows.push(["Basic Information"]);
  const deliverTo =
    pr.deliver_to === "Other Location"
      ? `Other Location — ${pr.deliver_to_address || ""}`
      : pr.deliver_to || "";
  rows.push(["PR No:", pr.pr_number || "", "PR Date:", pr.request_date || ""]);
  rows.push([
    "Project:",
    `${pr.projects?.name || ""}${pr.projects?.code ? ` (${pr.projects.code})` : ""}`,
    "Required Delivery Date:",
    pr.required_date || "",
  ]);
  rows.push(["Supplier:", pr.suppliers?.name || "", "Deliver To:", deliverTo]);
  rows.push([]);

  rows.push(["Item to Purchase"]);
  rows.push(["No", "ITEM NO", "DESCRIPTION", "SKU No", "QTY", "UOM", "REMARK"]);
  items.forEach((it, i) => {
    rows.push([
      i + 1,
      it.item_number || "",
      it.description || "",
      it.sku || "",
      it.qty ?? "",
      it.uoms?.name || "",
      it.remark || "",
    ]);
  });
  rows.push([]);

  rows.push(["Attachment"]);
  if (attachments.length === 0) {
    rows.push(["None"]);
  } else {
    attachments.forEach((a) => {
      const label =
        a.category === "drawing" && a.drawing_number
          ? `${a.filename} (Drawing ${a.drawing_number}, Rev ${a.revision_no || "-"})`
          : a.filename;
      rows.push([label]);
    });
  }
  rows.push([]);

  // Same "Purchasing & Delivery Record" section as the PDF — only shown when
  // there's something to show, matching the PDF's own conditional.
  if (pr.po_number || deliveries.length > 0 || pr.postponed_delivery_date) {
    rows.push(["Purchasing & Delivery Record"]);
    if (pr.po_number) rows.push([`PO ${pr.po_number} issued ${pr.po_date || ""}`]);
    if (pr.new_delivery_date) rows.push([`Confirmed delivery date: ${pr.new_delivery_date}`]);
    if (pr.postponed_delivery_date) rows.push([`Postponed to: ${pr.postponed_delivery_date}`]);
    deliveries.forEach((d) => {
      rows.push([`DO ${d.do_number} — ${d.type === "complete" ? "Complete" : "Partial"} delivery on ${d.delivery_date}`]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Reasonable fixed column widths so the sheet reads cleanly without the
  // user needing to resize anything on open.
  ws["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 32 },
    { wch: 14 },
    { wch: 8 },
    { wch: 10 },
    { wch: 26 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Purchase Requisition");

  const filename = `${pr.pr_number || "PR"}.xlsx`;
  XLSX.writeFile(wb, filename);
}

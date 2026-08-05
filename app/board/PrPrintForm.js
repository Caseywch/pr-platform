"use client";

// A print-only rendering of the Purchase Requisition Form, laid out to match
// the company's PPD-005 template. It is hidden on screen and only becomes
// visible to the printer, so "Save as PDF" produces the proper form rather
// than a screenshot of the app.

const ROWS = 5; // the template always shows five item lines

const cellStyle = {
  border: "1px solid #000",
  padding: "4px 5px",
  fontSize: "14px",
  verticalAlign: "top",
  wordBreak: "break-word",
  overflowWrap: "break-word",
};
const headStyle = { ...cellStyle, fontWeight: "bold", textAlign: "center", background: "#eee" };
const labelStyle = { ...cellStyle, fontWeight: "bold", width: "18%", whiteSpace: "nowrap" };
const valueStyle = { ...cellStyle, width: "32%" };

const signatureName = {
  fontFamily: '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive',
  fontWeight: "bold",
  fontStyle: "italic",
  fontSize: "18px",
  minHeight: "24px",
};

function SignBlock({ role, name, date }) {
  return (
    <div style={{ width: "32%", fontSize: "14px" }}>
      <div style={{ marginBottom: "2px" }}>{role}:</div>
      <div style={signatureName}>{name || "\u00a0"}</div>
      <div>…………………………….</div>
      <div style={{ marginTop: "2px" }}>Date: {date || ""}</div>
    </div>
  );
}

export default function PrPrintForm({ pr, items = [], attachments = [], deliveries = [] }) {
  if (!pr) return null;

  const rows = [...items];
  while (rows.length < ROWS) rows.push(null);

  const deliverTo =
    pr.deliver_to === "Other Location"
      ? `Other Location — ${pr.deliver_to_address || ""}`
      : pr.deliver_to || "";

  return (
    <div id="pr-print-form" style={{ color: "#000", background: "#fff", padding: "14px" }}>
      <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "18px" }}>
        FEDERAL FURNITURE (1982) SDN BHD
      </div>
      <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "20px", margin: "10px 0 14px" }}>
        PURCHASE REQUISITION FORM
      </div>

      <div style={{ fontWeight: "bold", fontSize: "14px", marginBottom: "4px" }}>Basic Information</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
        <tbody>
          <tr>
            <td style={labelStyle}>PR No:</td>
            <td style={valueStyle}>{pr.pr_number || ""}</td>
            <td style={labelStyle}>PR Date:</td>
            <td style={valueStyle}>{pr.request_date || ""}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Project:</td>
            <td style={valueStyle}>
              {pr.projects?.name || ""}{pr.projects?.code ? ` (${pr.projects.code})` : ""}
            </td>
            <td style={labelStyle}>Required Delivery Date:</td>
            <td style={valueStyle}>{pr.required_date || ""}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Supplier:</td>
            <td style={valueStyle}>{pr.suppliers?.name || ""}</td>
            <td style={labelStyle}>Deliver To:</td>
            <td style={valueStyle}>{deliverTo}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: "bold", fontSize: "14px", marginBottom: "4px" }}>Item to Purchase</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
        <thead>
          <tr>
            <th style={{ ...headStyle, width: "5%", whiteSpace: "nowrap" }}>No</th>
            <th style={{ ...headStyle, width: "13%", whiteSpace: "nowrap" }}>ITEM NO</th>
            <th style={{ ...headStyle, width: "30%", whiteSpace: "nowrap" }}>DESCRIPTION</th>
            <th style={{ ...headStyle, width: "9%", whiteSpace: "nowrap" }}>SKU No</th>
            <th style={{ ...headStyle, width: "6%", whiteSpace: "nowrap" }}>QTY</th>
            <th style={{ ...headStyle, width: "8%", whiteSpace: "nowrap" }}>UOM</th>
            <th style={{ ...headStyle, width: "29%", whiteSpace: "nowrap" }}>REMARK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it, i) => (
            <tr key={i}>
              <td style={{ ...cellStyle, textAlign: "center" }}>{i + 1}</td>
              <td style={cellStyle}>{it?.item_number || "\u00a0"}</td>
              <td style={cellStyle}>{it?.description || "\u00a0"}</td>
              <td style={cellStyle}>{it?.sku || "\u00a0"}</td>
              <td style={{ ...cellStyle, textAlign: "center" }}>{it?.qty ?? "\u00a0"}</td>
              <td style={{ ...cellStyle, textAlign: "center" }}>{it?.uoms?.name || "\u00a0"}</td>
              <td style={cellStyle}>{it?.remark || "\u00a0"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontWeight: "bold", fontSize: "14px", marginBottom: "4px" }}>Attachment</div>
      <div style={{ fontSize: "14px", border: "1px solid #000", padding: "6px", minHeight: "34px", marginBottom: "16px" }}>
        {attachments.length === 0 && <span>None</span>}
        {attachments.map((a, i) => (
          <div key={a.id || i}>
            • {a.filename}
            {a.category === "drawing" && a.drawing_number
              ? ` (Drawing ${a.drawing_number}, Rev ${a.revision_no || "-"})`
              : ""}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
        <SignBlock role="Requested by" name={pr.requester?.name} date={pr.request_date} />
        <SignBlock role="Verified by" name={pr.verifier?.name} date={pr.verified_date} />
        <SignBlock role="Approved by" name={pr.approver?.name} date={pr.approved_date} />
      </div>

      {/* Operational detail sits below the form proper, outside the template. */}
      {(pr.po_number || deliveries.length > 0 || pr.postponed_delivery_date) && (
        <div style={{ borderTop: "1px solid #999", paddingTop: "8px", fontSize: "14px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "3px" }}>Purchasing &amp; Delivery Record</div>
          {pr.po_number && <div>PO {pr.po_number} issued {pr.po_date}</div>}
          {pr.new_delivery_date && <div>Confirmed delivery date: {pr.new_delivery_date}</div>}
          {pr.postponed_delivery_date && <div>Postponed to: {pr.postponed_delivery_date}</div>}
          {deliveries.map((d) => (
            <div key={d.id}>
              DO {d.do_number} — {d.type === "complete" ? "Complete" : "Partial"} delivery on {d.delivery_date}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "14px", fontSize: "11px" }}>Form: PPD-005</div>
    </div>
  );
}

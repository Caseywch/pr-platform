// Plain, readable HTML templates for each workflow email. Kept deliberately
// simple (no external images, no complex layout) since transactional email
// clients render inconsistently — plain tables and basic styling are the
// safest choice.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pr-platform-pi.vercel.app";

const wrap = (title, bodyHtml) => `
  <!doctype html>
  <html>
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;">
  <div style="font-family: Arial, Helvetica, sans-serif; color: #171717; max-width: 480px; margin: 0 auto;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #737373; margin-bottom: 4px;">
      Purchase Requisition Platform
    </div>
    <h2 style="font-size: 18px; margin: 0 0 16px;">${title}</h2>
    ${bodyHtml}
    <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #a3a3a3;">
      Federal Furniture (1982) Sdn Bhd — Purchase Requisition Platform
    </div>
  </div>
  </body>
  </html>
`;

const prLink = (prId, prNumber) =>
  `<a href="${APP_URL}/board?pr=${prId}" style="color: #171717; font-weight: bold;">${prNumber}</a>`;

// Project + Supplier context line, shown under the PR link in every
// PR-related email except the new-user welcome email (which isn't tied to
// a specific PR). Falls back gracefully if either is missing.
const prContext = (pr) => {
  const projectPart = pr.projects?.name
    ? `${pr.projects.name}${pr.projects.code ? ` (${pr.projects.code})` : ""}`
    : null;
  const supplierPart = pr.suppliers?.name || null;
  if (!projectPart && !supplierPart) return "";
  const parts = [projectPart, supplierPart].filter(Boolean).join(" · ");
  return `<p style="color: #737373; font-size: 13px; margin: 2px 0 0;">${parts}</p>`;
};

export function poIssuedEmail(pr) {
  const dateLine = pr.new_delivery_date
    ? `<p>Delivery is confirmed for <strong>${pr.new_delivery_date}</strong>.</p>`
    : `<p>No confirmed delivery date was set; the originally required date of <strong>${pr.required_date}</strong> stands.</p>`;
  return {
    subject: `PO issued for ${pr.pr_number}`,
    html: wrap("Purchase Order Issued", `
      <p>${prLink(pr.id, pr.pr_number)} has had a purchase order issued (PO ${pr.po_number}).</p>
      ${prContext(pr)}
      ${dateLine}
    `),
  };
}

export function rejectedEmail(pr, reason) {
  return {
    subject: `${pr.pr_number} needs revision`,
    html: wrap("Requisition Needs Revision", `
      <p>${prLink(pr.id, pr.pr_number)} has been sent back for revision.</p>
      ${prContext(pr)}
      <p><strong>Reason:</strong> ${reason}</p>
      <p>The Requester can amend and resubmit it from the PR Board.</p>
    `),
  };
}

export function deliveryEmail(pr, delivery) {
  const complete = delivery.type === "complete";
  return {
    subject: `${complete ? "Delivery complete" : "Partial delivery"} for ${pr.pr_number}`,
    html: wrap(complete ? "Delivery Complete" : "Partial Delivery Recorded", `
      <p>${prLink(pr.id, pr.pr_number)} — a ${complete ? "complete" : "partial"} delivery was recorded
      (DO ${delivery.do_number}) on <strong>${delivery.delivery_date}</strong>.</p>
      ${prContext(pr)}
    `),
  };
}

export function postponedEmail(pr, newDate, reason) {
  return {
    subject: `Delivery postponed for ${pr.pr_number}`,
    html: wrap("Delivery Date Postponed", `
      <p>The delivery for ${prLink(pr.id, pr.pr_number)} has been postponed to <strong>${newDate}</strong>.</p>
      ${prContext(pr)}
      <p><strong>Reason:</strong> ${reason}</p>
    `),
  };
}

export function prEditedEmail(pr) {
  return {
    subject: `${pr.pr_number} was edited by the Requester`,
    html: wrap("Requisition Edited", `
      <p>${prLink(pr.id, pr.pr_number)} has been edited directly by the Requester.</p>
      ${prContext(pr)}
      <p>This applied immediately, since no purchase order has been issued yet. No action is needed unless you'd like to review the current details.</p>
    `),
  };
}

// Purchasing's notification that a Requester has proposed a change on a
// post-PO PR. diff is the same { fields, itemChanges, hasChanges } shape
// buildChangeRequestDiff returns — kept as plain data rather than HTML so
// this template controls its own layout instead of trusting caller markup.
export function prChangeRequestedEmail(pr, diff) {
  const fieldRows = diff.fields
    .map(
      (f) => `
      <tr>
        <td style="padding: 4px 8px 4px 0; color: #737373; vertical-align: top; white-space: nowrap;">${f.label}</td>
        <td style="padding: 4px 0;"><span style="text-decoration: line-through; color: #a3a3a3;">${f.old}</span> &rarr; <strong>${f.new}</strong></td>
      </tr>`
    )
    .join("");
  const itemRows = diff.itemChanges
    .map(
      (ic) => `
      <tr>
        <td style="padding: 4px 8px 4px 0; color: #737373; vertical-align: top; white-space: nowrap;">Item ${ic.index}</td>
        <td style="padding: 4px 0;">
          ${ic.old ? `<div style="text-decoration: line-through; color: #a3a3a3;">${ic.old}</div>` : ""}
          <div>${ic.new || "(removed)"}</div>
        </td>
      </tr>`
    )
    .join("");
  return {
    subject: `Change requested — ${pr.pr_number}`,
    html: wrap("Change Requested", `
      <p>A change has been proposed for ${prLink(pr.id, pr.pr_number)}, which already has a purchase order issued.</p>
      ${prContext(pr)}
      ${
        diff.hasChanges
          ? `<table style="margin: 12px 0; font-size: 13px; border-collapse: collapse; width: 100%;">${fieldRows}${itemRows}</table>`
          : `<p style="color: #737373;">No fields appear changed.</p>`
      }
      <p>Please check with the supplier whether this can be accommodated, then approve or reject the request on the platform.</p>
    `),
  };
}

export function prChangeDecisionEmail(pr, approved, reason) {
  return {
    subject: `Change request ${approved ? "approved" : "rejected"} — ${pr.pr_number}`,
    html: wrap(approved ? "Change Request Approved" : "Change Request Rejected", `
      <p>Purchasing has ${approved ? "approved" : "rejected"} the proposed change for
      ${prLink(pr.id, pr.pr_number)}.</p>
      ${prContext(pr)}
      <p>${
        approved
          ? "The requisition has been updated with the new details."
          : `The requisition keeps its original details.${reason ? ` Reason: ${reason}` : ""}`
      }</p>
    `),
  };
}

export function newUserEmail(name, email, pin) {
  return {
    subject: "Your Purchase Requisition Platform account",
    html: wrap("Welcome to the PR Platform", `
      <p>Hi ${name},</p>
      <p>An account has been created for you on the Federal Furniture Purchase Requisition Platform.</p>
      <table style="margin: 12px 0; font-size: 14px;">
        <tr><td style="padding: 2px 8px 2px 0; color: #737373;">Email</td><td><strong>${email}</strong></td></tr>
        <tr><td style="padding: 2px 8px 2px 0; color: #737373;">PIN</td><td><strong>${pin}</strong></td></tr>
      </table>
      <p><a href="${APP_URL}/login" style="display: inline-block; background: #171717; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Sign in to the platform</a></p>
      <p style="font-size: 12px; color: #737373;">Keep your PIN private. You can ask your Administrator to reset it at any time.</p>
    `),
  };
}

// Daily reminder for whatever is overdue in someone's queue. One email per
// person listing everything at once, each item a direct link to that PR.
export function overdueReminderEmail(name, items) {
  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding: 6px 10px 6px 0; border-bottom: 1px solid #e5e5e5;">
          <a href="${APP_URL}/board?pr=${i.id}" style="color: #171717; font-weight: bold; text-decoration: none;">${i.pr_number}</a>
          ${i.project || i.supplier ? `<div style="color: #737373; font-weight: normal; font-size: 12px; margin-top: 1px;">${[i.project, i.supplier].filter(Boolean).join(" · ")}</div>` : ""}
        </td>
        <td style="padding: 6px 10px 6px 0; border-bottom: 1px solid #e5e5e5; color: #737373;">${i.action}</td>
        <td style="padding: 6px 0 6px 0; border-bottom: 1px solid #e5e5e5; color: #B23A2E;">${i.dueLabel}</td>
      </tr>`
    )
    .join("");

  return {
    subject: `${items.length} requisition${items.length === 1 ? "" : "s"} awaiting your action`,
    html: wrap("Action Needed", `
      <p>Hi ${name},</p>
      <p>The following requisition${items.length === 1 ? " is" : "s are"} overdue and waiting on you. Click any
      one to open it directly.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 12px 0;">
        <thead>
          <tr style="text-align: left; color: #737373;">
            <th style="padding: 0 10px 6px 0;">PR</th>
            <th style="padding: 0 10px 6px 0;">Action needed</th>
            <th style="padding: 0;">Overdue since</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p><a href="${APP_URL}/my-actions" style="display: inline-block; background: #171717; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none;">View all in My Actions</a></p>
      <p style="font-size: 12px; color: #737373;">You'll get this reminder daily for as long as an item stays overdue.</p>
    `),
  };
}

// --- Cancellation-request emails -------------------------------------------

export function cancelRequestedEmail(pr, reason, toPurchaser) {
  return {
    subject: `Cancellation requested for ${pr.pr_number}`,
    html: wrap("Cancellation Requested", `
      <p>A cancellation has been requested for ${prLink(pr.id, pr.pr_number)}.</p>
      ${prContext(pr)}
      <p><strong>Reason:</strong> ${reason}</p>
      <p>${
        toPurchaser
          ? "A PO has already been issued for this requisition. Purchasing has been asked to confirm the PO can be cancelled with the supplier before this goes to your Administrator."
          : "This has been sent to your Administrator to approve."
      }</p>
    `),
  };
}

export function cancelPurchaserDecisionEmail(pr, canCancel) {
  return {
    subject: `${canCancel ? "PO can be cancelled" : "PO cannot be cancelled"} — ${pr.pr_number}`,
    html: wrap("Purchasing Has Responded", `
      <p>Purchasing has ${canCancel ? "confirmed the PO can be cancelled" : "advised the PO cannot be cancelled"}
      for ${prLink(pr.id, pr.pr_number)}.</p>
      ${prContext(pr)}
      <p>${
        canCancel
          ? "This has now been sent to your Administrator for final approval."
          : "The cancellation request has ended here; the requisition remains active."
      }</p>
    `),
  };
}

export function cancelAdminDecisionEmail(pr, approved) {
  return {
    subject: `Cancellation ${approved ? "approved" : "declined"} — ${pr.pr_number}`,
    html: wrap(approved ? "Cancellation Approved" : "Cancellation Declined", `
      <p>Your Administrator has ${approved ? "approved" : "declined"} the cancellation request for
      ${prLink(pr.id, pr.pr_number)}.</p>
      ${prContext(pr)}
      <p>${
        approved
          ? "The requisition is now cancelled."
          : "The requisition remains active. A new cancellation request can be submitted if needed."
      }</p>
    `),
  };
}

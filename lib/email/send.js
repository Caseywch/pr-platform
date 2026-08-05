// Central place for sending workflow emails. Dormant until RESEND_API_KEY
// exists in the environment — every call below no-ops quietly rather than
// throwing, so the app works exactly as it does today until the key is added.
import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM || "Federal Furniture PR Platform <noreply@fihb.my>";

function client() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// Never let a failed or unconfigured email break the workflow action that
// triggered it. Errors are logged server-side, not surfaced to the user.
export async function sendMail({ to, subject, html }) {
  const resend = client();
  if (!resend) {
    console.log("[email] RESEND_API_KEY not set — skipping:", subject, "to", to);
    return { skipped: true };
  }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) return { skipped: true };
  try {
    return await resend.emails.send({ from: FROM, to: recipients, subject, html });
  } catch (err) {
    console.error("[email] send failed:", subject, err?.message || err);
    return { error: true };
  }
}

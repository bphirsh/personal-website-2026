/**
 * The beta list (M-027, 30 Oct 2026): what /api/signup and /api/invite-reply do with a new email before telling me.
 *
 * joinBetaList adds the person to Resend's "Beta" segment as a contact, or updates them if the email is already a contact, so signing up twice never duplicates. sendConfirmation sends them the standard "You're on the Workspace beta list" email from api/_confirmation.js. Neither throws: each returns { ok, detail }, and the caller puts any failure in my notification so a sign-up is never lost.
 *
 * Resend's audiences are now segments; RESEND_AUDIENCE_ID holds the segment id. The computer and agents are saved on the contact as two string properties (Brian, 30 Oct 2026), `computer` (one code, as mac-apple-silicon) and `agents` (codes joined by commas, as claude,cursor), the same codes the Signups database's options use, so tools/sync-signups.mts can copy them across. Resend refuses a property it hasn't been told about, so the first time a write fails these two are created and the write tried once more. Endpoints read from Resend's docs on 30 Oct 2026: POST /contacts (with segments and properties), PATCH /contacts/{email}, POST /contacts/{email}/segments/{id}, POST /contact-properties.
 *
 * Files starting with "_" in api/ are not deployed as endpoints; this one is only required by the two that are.
 */

const confirmation = require('./_confirmation.js');

const RESEND = 'https://api.resend.com';

async function call(apiKey, method, path, body) {
  try {
    const res = await fetch(RESEND + path, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const detail = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 300);
    return { ok: res.ok, status: res.status, detail };
  } catch (err) {
    return { ok: false, status: 0, detail: String(err && err.message || err).slice(0, 300) };
  }
}

/** "Sam Q. Test" → { first_name: "Sam", last_name: "Q. Test" }; no name, no fields. */
function nameFields(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { first_name: parts[0], ...(parts.length > 1 ? { last_name: parts.slice(1).join(' ') } : {}) };
}

/** The properties we keep on a contact. Created once, by ensureProperties, when Resend doesn't know them yet. */
const PROPERTY_KEYS = ['computer', 'agents'];

async function ensureProperties(apiKey) {
  // One that already exists fails here, which is fine: either way it exists afterwards.
  for (const key of PROPERTY_KEYS) await call(apiKey, 'POST', '/contact-properties', { key, type: 'string' });
}

/** { computer, agents } as Resend properties, leaving out what wasn't said rather than writing an empty value over an earlier one. */
function propertyFields(computer, agents) {
  const out = {};
  if (computer) out.computer = String(computer);
  // A free-typed tool from the try page could hold a comma, which would split it in two when read back.
  if (agents && agents.length) out.agents = agents.map((a) => String(a).replace(/,/g, ' ').trim()).filter(Boolean).join(',').slice(0, 500);
  return out;
}

/**
 * Put this email in the Beta segment, with its computer and agents. A new contact is created there; when that fails because the email is already a contact, its name is updated (if one was given) and it is added to the segment, which leaves an unsubscribed contact unsubscribed.
 */
async function joinBetaList({ apiKey, segmentId, email, name, computer, agents }) {
  if (!segmentId) return { ok: false, detail: 'RESEND_AUDIENCE_ID is not set' };
  const names = nameFields(name);
  const properties = propertyFields(computer, agents);
  const hasProps = Object.keys(properties).length > 0;
  const contact = { email, ...names, ...(hasProps ? { properties } : {}), segments: [{ id: segmentId }] };

  let created = await call(apiKey, 'POST', '/contacts', contact);
  if (!created.ok && hasProps) {
    // Perhaps the properties aren't created yet: create them and try once more.
    await ensureProperties(apiKey);
    created = await call(apiKey, 'POST', '/contacts', contact);
  }
  if (created.ok) return { ok: true, detail: 'added' };

  // Already a contact (or the create failed for another reason): update by email and add to the segment. If the contact doesn't exist, these fail too and the first error is the one reported.
  const at = encodeURIComponent(email);
  const change = { ...names, ...(hasProps ? { properties } : {}) };
  if (Object.keys(change).length) {
    const updated = await call(apiKey, 'PATCH', `/contacts/${at}`, change);
    if (!updated.ok) return { ok: false, detail: `create ${created.status} ${created.detail}; update ${updated.status} ${updated.detail}` };
  }
  const added = await call(apiKey, 'POST', `/contacts/${at}/segments/${encodeURIComponent(segmentId)}`);
  if (!added.ok) return { ok: false, detail: `create ${created.status} ${created.detail}; add to segment ${added.status} ${added.detail}` };
  return { ok: true, detail: 'already a contact, updated' };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** The confirmation, greeting them by first name, or "there" when no name was given (the try page's Notify button sends none). */
function confirmationFor(name) {
  const first = nameFields(name).first_name || 'there';
  return {
    subject: confirmation.subject,
    html: confirmation.html.split('{{name}}').join(escapeHtml(first)),
    text: confirmation.text.split('{{name}}').join(first),
  };
}

async function sendConfirmation({ apiKey, from, email, name }) {
  const c = confirmationFor(name);
  const sent = await call(apiKey, 'POST', '/emails', { from, to: [email], subject: c.subject, html: c.html, text: c.text });
  return sent.ok ? { ok: true, detail: 'sent' } : { ok: false, detail: `${sent.status} ${sent.detail}` };
}

module.exports = { joinBetaList, sendConfirmation, confirmationFor, nameFields, propertyFields, PROPERTY_KEYS };

/**
 * POST /api/invite-reply — the button at the end of /workspace/try.
 *
 * Emails me what the person chose to send after seeing the demo: their email address (required since M-013, so I can write back), invite code, computer, role and tools.
 * Nothing from their file is sent or seen here; the file is read in their
 * browser and stays there. Since M-027 (30 Oct 2026) their email also joins
 * the Resend beta list and gets the confirmation, like /api/signup
 * (api/_beta-list.js); my email says whether both worked.
 *
 * Deliberately dependency-free, like /api/signup — Resend's REST API is called
 * with plain fetch, so the repo stays a zero-config static deploy.
 *
 * Environment variables: the same as /api/signup (RESEND_API_KEY,
 * NOTIFY_EMAIL, RESEND_FROM, RESEND_AUDIENCE_ID). See api/README.md.
 */

const { joinBetaList, sendConfirmation } = require('./_beta-list.js');

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;
const INVITE_RE = /^\d{2}-[a-z0-9]{4}$/;
const PLATFORMS = ['mac-apple-silicon', 'mac-intel', 'windows', 'linux', 'other'];
const ROLES = ['coder', 'knowledge-worker', 'both', 'other'];
const MAX_TOOLS = 20;
const MAX_TOOL = 40;

// The only fields read. Anything else in the body is ignored, never echoed.
const FIELDS = ['invite', 'platform', 'role', 'ai_tools', 'knowledge_tools', 'email'];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** A list of short tool names, or null when it is not one. */
function toolList(v) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_TOOLS) return null;
  const out = v.map((t) => String(t).trim()).filter(Boolean);
  return out.every((t) => t.length <= MAX_TOOL) ? out : null;
}

/**
 * Validate a reply. Returns `{ ok: true, reply }` with exactly the six fields,
 * or `{ ok: false, error }`. Exported so tools/check-invite-reply.mjs can test
 * it without a server.
 */
function readReply(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Malformed request.' };

  const invite = String(data.invite ?? 'none').trim().toLowerCase();
  if (invite !== 'none' && !INVITE_RE.test(invite)) return { ok: false, error: 'That invite code is not one of ours.' };

  const platform = String(data.platform ?? '').trim();
  if (!PLATFORMS.includes(platform)) return { ok: false, error: 'Please choose a computer.' };

  // Optional since 27 Oct 2026: the page sends it only when their file said one. When sent, it must be one of ours.
  const role = String(data.role ?? '').trim();
  if (role && !ROLES.includes(role)) return { ok: false, error: 'That role is not one of ours.' };

  const ai = toolList(data.ai_tools);
  const knowledge = toolList(data.knowledge_tools);
  if (!ai || !knowledge) return { ok: false, error: 'The tools list could not be read.' };

  // Required since M-013: the signup is "Email me at … when it's ready!".
  const email = String(data.email ?? '').trim();
  if (!email) return { ok: false, error: 'Add your email first.' };
  if (email.length > 160 || !EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };

  return { ok: true, reply: { invite, platform, role: role || null, ai_tools: ai, knowledge_tools: knowledge, email } };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  // Vercel's Node runtime parses JSON bodies, but a string can still arrive
  // if the content-type was off.
  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = null; }
  }

  // Re-validated here because anything arriving over the network is untrusted,
  // whatever the page checked before sending it.
  const read = readReply(data);
  if (!read.ok) {
    res.status(400).json({ error: read.error });
    return;
  }
  const r = read.reply;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) {
    console.error('invite-reply: RESEND_API_KEY or NOTIFY_EMAIL is not set');
    res.status(500).json({ error: 'The reply service is misconfigured.' });
    return;
  }

  // The list first, then the confirmation only if they are on it. No name is asked on the try page, so the greeting is "Hi there".
  const from = process.env.RESEND_FROM || 'Workspace Dev <onboarding@resend.dev>';
  const list = await joinBetaList({ apiKey, segmentId: process.env.RESEND_AUDIENCE_ID, email: r.email, name: '', computer: r.platform, agents: r.ai_tools });
  const confirm = list.ok
    ? await sendConfirmation({ apiKey, from, email: r.email, name: '' })
    : { ok: false, detail: 'not sent, since they are not on the list' };
  if (!list.ok) console.error('invite-reply: beta list failed', list.detail);
  if (!confirm.ok) console.error('invite-reply: confirmation failed', confirm.detail);

  const when = new Date().toISOString();
  const rows = [
    ['Invite', r.invite],
    ['Computer', r.platform],
    ['Role', r.role ?? '(not said)'],
    ['AI tools', r.ai_tools.join(', ') || '(none)'],
    ['Knowledge tools', r.knowledge_tools.join(', ') || '(none)'],
    ['Email', r.email],
    ['Beta list', list.ok ? `on the list (${list.detail})` : `FAILED: ${list.detail}`],
    ['Confirmation', confirm.ok ? 'sent' : `FAILED: ${confirm.detail}`],
    ['When', when],
  ];

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        // Reply-To their email, so replying goes straight to them.
        reply_to: r.email,
        subject: `Workspace invite reply — ${r.invite} (${r.platform})${list.ok && confirm.ok ? '' : ' (check the list)'}`,
        html:
          `<h2 style="font-family:system-ui,sans-serif">Workspace invite reply</h2>` +
          `<table style="font-family:system-ui,sans-serif;font-size:15px;border-collapse:collapse">` +
          rows.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0"><strong>${k}</strong></td><td>${escapeHtml(v)}</td></tr>`).join('') +
          `</table>`,
        text: `Workspace invite reply\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n`,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => '');
      // Logged, never returned — the same as /api/signup.
      console.error('invite-reply: resend failed', resendRes.status, detail.slice(0, 500));
      // On the list, they are recorded even though my email failed: no error for them.
      if (list.ok) { res.status(201).json({ ok: true }); return; }
      res.status(502).json({ error: "That didn't send.", upstream: resendRes.status });
      return;
    }
  } catch (err) {
    console.error('invite-reply: resend threw', err);
    if (list.ok) { res.status(201).json({ ok: true }); return; }
    res.status(502).json({ error: "That didn't send." });
    return;
  }

  res.status(201).json({ ok: true });
};

module.exports.readReply = readReply;
module.exports.FIELDS = FIELDS;

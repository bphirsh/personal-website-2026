/**
 * POST /api/signup — dev build access request form.
 *
 * Validates a name plus an email-or-phone, and since 28 Oct 2026 the computer
 * they'd use and the agents they use, then emails it to me. The page requires
 * the computer and leaves the agents optional; here both are optional, so a
 * request from the old page still works, but anything sent must be one of
 * the known values. There is no
 * database on purpose: this is a handful of friends trying a dev build for a
 * couple of months, and an inbox is a perfectly good record for that. The
 * real system gets built separately at launch.
 *
 * Deliberately dependency-free — Resend's REST API is called with plain fetch
 * rather than its SDK, so no package.json is needed and the repo stays a
 * zero-config static deploy.
 *
 * Environment variables (Vercel → Settings → Environment Variables):
 *   RESEND_API_KEY   from resend.com
 *   NOTIFY_EMAIL     where signups are sent
 *   RESEND_FROM      optional; defaults to Resend's shared onboarding sender
 */

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

// The page's choices, by the values it sends, and how the email shows them.
const COMPUTERS = { 'mac-apple-silicon': 'Mac with Apple silicon', 'mac-intel': 'Mac with Intel', windows: 'Windows PC', linux: 'Linux', other: 'Something else' };
const AGENTS = { claude: 'Claude', chatgpt: 'ChatGPT', grok: 'Grok', muse: 'Muse', gemini: 'Gemini', codex: 'Codex', cursor: 'Cursor', other: 'Something else' };
const PHONE_CHARS_RE = /^[\d\s+().-]+$/;

/**
 * Accept an email OR a phone number. Deliberately loose: wrongly rejecting a
 * real person's unusual-but-valid contact costs far more than letting a typo
 * through, which I'd spot by hand anyway.
 */
function classifyContact(value) {
  const v = (value || '').trim();
  if (v.includes('@')) return EMAIL_RE.test(v) ? 'email' : null;
  const digits = v.replace(/\D/g, '');
  if (digits.length >= 7 && digits.length <= 15 && PHONE_CHARS_RE.test(v)) return 'phone';
  return null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Malformed request.' });
    return;
  }

  // Silently accept-and-drop anything that tripped the honeypot, so a bot
  // gets no signal that it was spotted.
  if (String(data.website || '').trim()) {
    res.status(201).json({ ok: true });
    return;
  }

  const name = String(data.name || '').trim();
  const contact = String(data.contact || '').trim();

  if (!name || name.length > 120) {
    res.status(400).json({ error: 'Please provide a name.' });
    return;
  }
  if (!contact || contact.length > 160) {
    res.status(400).json({ error: 'Please provide an email or phone number.' });
    return;
  }

  // Re-validated here because anything arriving over the network is untrusted,
  // whatever the page checked before sending it.
  const kind = classifyContact(contact);
  if (!kind) {
    res.status(400).json({ error: "That doesn't look like an email or phone number." });
    return;
  }

  // The computer and agents: optional, but only known values, each at most once.
  const computer = data.computer == null || data.computer === '' ? null : String(data.computer);
  if (computer !== null && !Object.prototype.hasOwnProperty.call(COMPUTERS, computer)) {
    res.status(400).json({ error: 'Please choose a computer.' });
    return;
  }
  const agentList = data.agents == null ? [] : data.agents;
  if (!Array.isArray(agentList) || agentList.length > Object.keys(AGENTS).length
      || agentList.some((a) => typeof a !== 'string' || !Object.prototype.hasOwnProperty.call(AGENTS, a))) {
    res.status(400).json({ error: "Those agents couldn't be read." });
    return;
  }
  const agents = [...new Set(agentList)];
  const computerText = computer ? COMPUTERS[computer] : '(not said)';
  const agentsText = agents.length ? agents.map((a) => AGENTS[a]).join(', ') : '(none)';

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) {
    console.error('signup: RESEND_API_KEY or NOTIFY_EMAIL is not set');
    res.status(500).json({ error: 'The signup service is misconfigured.' });
    return;
  }

  const when = new Date().toISOString();
  const safeName = escapeHtml(name);
  const safeContact = escapeHtml(contact);
  // Reply-To only when it's an email, so replying goes straight to them.
  const replyTo = kind === 'email' ? contact : undefined;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Workspace Dev <onboarding@resend.dev>',
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: `Workspace access request — ${name}`,
        html:
          `<h2 style="font-family:system-ui,sans-serif">New Workspace access request</h2>` +
          `<table style="font-family:system-ui,sans-serif;font-size:15px;border-collapse:collapse">` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Name</strong></td><td>${safeName}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>${kind === 'email' ? 'Email' : 'Phone'}</strong></td><td>${safeContact}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Computer</strong></td><td>${escapeHtml(computerText)}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Agents</strong></td><td>${escapeHtml(agentsText)}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>When</strong></td><td>${when}</td></tr>` +
          `</table>`,
        text: `New Workspace access request\n\nName: ${name}\n${kind === 'email' ? 'Email' : 'Phone'}: ${contact}\nComputer: ${computerText}\nAgents: ${agentsText}\nWhen: ${when}\n`,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => '');
      // The body is logged but never returned — it can carry provider detail
      // that doesn't belong in a public response. The bare status code is
      // returned, because it tells an attacker nothing while turning a
      // 10-minute log dig into an instant diagnosis during setup:
      //   401 -> the API key is wrong
      //   403 -> NOTIFY_EMAIL isn't this Resend account's own address
      //          (the shared onboarding@resend.dev sender only delivers there)
      console.error('signup: resend failed', resendRes.status, detail.slice(0, 500));
      res.status(502).json({
        error: "I couldn't record that just now — please try again shortly.",
        upstream: resendRes.status,
      });
      return;
    }
  } catch (err) {
    console.error('signup: resend threw', err);
    res.status(502).json({ error: "I couldn't record that just now — please try again shortly." });
    return;
  }

  res.status(201).json({ ok: true });
};

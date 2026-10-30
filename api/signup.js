/**
 * POST /api/signup — the beta access request form.
 *
 * Validates a name plus an email, and since 28 Oct 2026 the computer
 * they'd use and the agents they use. The computer is required, here as on
 * the page (since 30 Oct 2026, so no sign-up reaches the list without it;
 * "Something else" counts as an answer); the agents are optional. Anything
 * sent must be one of the known values.
 *
 * Since M-027 (30 Oct 2026) the email is required (a phone alone is no
 * longer accepted), the person joins the Resend beta list and gets the
 * confirmation email (api/_beta-list.js), and then the request is emailed to
 * me as before, saying whether the list and the confirmation worked. A
 * failure there never loses the sign-up: my email still goes.
 *
 * Deliberately dependency-free — Resend's REST API is called with plain fetch
 * rather than its SDK, so no package.json is needed and the repo stays a
 * zero-config static deploy.
 *
 * Environment variables (Vercel → Settings → Environment Variables):
 *   RESEND_API_KEY   from resend.com
 *   NOTIFY_EMAIL     where signups are sent
 *   RESEND_FROM      the sender; the confirmation needs it on the verified domain
 *   RESEND_AUDIENCE_ID  the Beta segment's id
 */

const { joinBetaList, sendConfirmation } = require('./_beta-list.js');

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

// The page's choices, by the values it sends, and how the email shows them.
const COMPUTERS = { 'mac-apple-silicon': 'Mac with Apple silicon', 'mac-intel': 'Mac with Intel', windows: 'Windows PC', linux: 'Linux', other: 'Something else' };
const AGENTS = { claude: 'Claude', chatgpt: 'ChatGPT', grok: 'Grok', muse: 'Muse', gemini: 'Gemini', codex: 'Codex', cursor: 'Cursor', other: 'Something else' };

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
  // `email` from the page since 30 Oct 2026; `contact` from a page loaded before then.
  const email = String(data.email ?? data.contact ?? '').trim();

  if (!name || name.length > 120) {
    res.status(400).json({ error: 'Please provide a name.' });
    return;
  }
  if (!email) {
    res.status(400).json({ error: 'Please provide an email address.' });
    return;
  }

  // Re-validated here because anything arriving over the network is untrusted,
  // whatever the page checked before sending it. Loose on purpose: a typo
  // getting through costs less than turning away a real address.
  if (email.length > 160 || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "That doesn't look like an email address." });
    return;
  }

  // The computer is required; the agents are optional. Only known values, each at most once.
  const computer = data.computer == null ? '' : String(data.computer);
  if (!Object.prototype.hasOwnProperty.call(COMPUTERS, computer)) {
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
  const computerText = COMPUTERS[computer];
  const agentsText = agents.length ? agents.map((a) => AGENTS[a]).join(', ') : '(none)';

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) {
    console.error('signup: RESEND_API_KEY or NOTIFY_EMAIL is not set');
    res.status(500).json({ error: 'The signup service is misconfigured.' });
    return;
  }

  const from = process.env.RESEND_FROM || 'Workspace Dev <onboarding@resend.dev>';

  // The list first, then the confirmation only if they are on it, so the email never says something untrue.
  const list = await joinBetaList({ apiKey, segmentId: process.env.RESEND_AUDIENCE_ID, email, name, computer, agents });
  const confirm = list.ok
    ? await sendConfirmation({ apiKey, from, email, name })
    : { ok: false, detail: 'not sent, since they are not on the list' };
  if (!list.ok) console.error('signup: beta list failed', list.detail);
  if (!confirm.ok) console.error('signup: confirmation failed', confirm.detail);
  const listText = list.ok ? `on the list (${list.detail})` : `FAILED: ${list.detail}`;
  const confirmText = confirm.ok ? 'sent' : `FAILED: ${confirm.detail}`;

  const when = new Date().toISOString();
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);

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
        // Reply-To them, so replying goes straight to them.
        reply_to: email,
        subject: `Workspace access request — ${name}${list.ok && confirm.ok ? '' : ' (check the list)'}`,
        html:
          `<h2 style="font-family:system-ui,sans-serif">New Workspace access request</h2>` +
          `<table style="font-family:system-ui,sans-serif;font-size:15px;border-collapse:collapse">` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Name</strong></td><td>${safeName}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Email</strong></td><td>${safeEmail}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Computer</strong></td><td>${escapeHtml(computerText)}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Agents</strong></td><td>${escapeHtml(agentsText)}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Beta list</strong></td><td>${escapeHtml(listText)}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>Confirmation</strong></td><td>${escapeHtml(confirmText)}</td></tr>` +
          `<tr><td style="padding:4px 14px 4px 0"><strong>When</strong></td><td>${when}</td></tr>` +
          `</table>`,
        text: `New Workspace access request\n\nName: ${name}\nEmail: ${email}\nComputer: ${computerText}\nAgents: ${agentsText}\nBeta list: ${listText}\nConfirmation: ${confirmText}\nWhen: ${when}\n`,
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
      // On the list, they are recorded even though my email failed: no error for them.
      if (list.ok) { res.status(201).json({ ok: true }); return; }
      res.status(502).json({
        error: "I couldn't record that just now — please try again shortly.",
        upstream: resendRes.status,
      });
      return;
    }
  } catch (err) {
    console.error('signup: resend threw', err);
    if (list.ok) { res.status(201).json({ ok: true }); return; }
    res.status(502).json({ error: "I couldn't record that just now — please try again shortly." });
    return;
  }

  res.status(201).json({ ok: true });
};

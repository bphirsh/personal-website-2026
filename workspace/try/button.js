/**
 * The button at the end of /workspace/try: it sends Brian the invite code,
 * computer, role and tools, and an email only if they typed one (M-005,
 * M-007, M-010). Nothing else from their file is ever sent; the body is built
 * here from those fields alone and nothing else.
 *
 * The button changes with the computer. A file that says `mac`, `other` or
 * `unknown` gets the question first, and the variant follows the answer.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The button".
 */

const ENDPOINT = '/api/invite-reply';
// The same check /api/invite-reply makes, so a typo is caught before sending.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

const WORDS = {
  sends: 'This sends Brian your invite code, computer, role and tools, and your email if you typed one. Nothing else from your file.',
  sendsSample: 'This sends Brian these three answers, and your email if you typed one. Nothing else.',
  sendsSampleCode: 'This sends Brian your invite code and these three answers, and your email if you typed one. Nothing else.',
  sending: 'Sending…',
  failed: "That didn't send. Check your connection and try again; nothing was sent.",
  question: 'Which computer would you use Workspace on?',
  chipHelp: 'Not sure which Mac? Apple menu → About This Mac: "Chip: Apple M…" is Apple silicon; "Processor: …Intel…" is Intel.',
  emailLabel: 'Your email (optional)',
  emailWhy: "So Brian knows it's you. It goes only to him, with your answer, and is never shared or added to a list.",
  emailPlaceholder: 'you@example.com',
  differentEmail: 'Use a different email?',
  differentWhy: "Only if you'd like Brian to reply somewhere other than the address he invited you at.",
  badEmail: "That doesn't look like an email address. Fix it, or clear the box to send without one.",
};

// The choices, in the copy's order, and the platform each means.
export const COMPUTERS = [
  ['mac-apple-silicon', 'Mac with Apple silicon'],
  ['mac-intel', 'Mac with Intel'],
  ['windows', 'Windows PC'],
  ['linux', 'Linux'],
  ['other', 'Something else'],
];

const VARIANTS = {
  'mac-apple-silicon': { button: "Yes! I want it when it's ready", after: (n) => `Thanks, ${n}. Brian has your answer and will be in touch when the build is ready.` },
  windows: { button: 'Tell me when Windows is ready', after: (n) => `Thanks, ${n}. Brian knows you're on Windows and will let you know.` },
  linux: { button: "Tell me if there's a Linux version", after: (n) => `Thanks, ${n}. Brian knows you're on Linux.` },
  'mac-intel': {
    line: "Workspace's build needs a Mac with Apple silicon (M1 or later), so it won't run on this Mac.",
    button: 'Keep me posted anyway',
    after: (n) => `Thanks, ${n}. Brian knows you're on an Intel Mac.`,
  },
  other: { button: 'Keep me posted', after: (n) => `Thanks, ${n}. Brian has your answer.` },
};

/**
 * The body the button sends: exactly these fields, `email` only when typed.
 * A tool is sent by its id when known, else as written.
 */
export function replyBody({ invite, platform, role, ai_tools, knowledge_tools }, email) {
  const ids = (list) => list.map((t) => (t.known ? t.id : t.label));
  const body = {
    invite: invite ?? 'none',
    platform,
    role,
    ai_tools: ids(ai_tools),
    knowledge_tools: ids(knowledge_tools),
  };
  const typed = String(email ?? '').trim();
  if (typed) body.email = typed;
  return body;
}

/**
 * Build the button into `mount`.
 *
 * `answers` holds invite (or null), name, platform, role, ai_tools and
 * knowledge_tools as invite.js reads them. `options.sample` switches the line
 * above the button to the sample's; `options.send` replaces the network call,
 * for tests.
 */
export function mountButton(mount, answers, options = {}) {
  const box = el('section', 'reply');
  mount.replaceChildren(box);
  const send = options.send ?? post;
  // `mac`, `other` and `unknown` are asked first; the answer picks the variant.
  // (The sample's taps have already asked: `options.sample`.)
  let platform = !options.sample && ['mac', 'other', 'unknown'].includes(answers.platform) ? null : answers.platform;

  render();

  function render() {
    box.replaceChildren();
    if (!platform || !VARIANTS[platform]) return ask();
    const v = VARIANTS[platform];
    if (v.line) box.appendChild(el('p', 'reply-line', v.line));
    const sends = options.sample ? (answers.invite ? WORDS.sendsSampleCode : WORDS.sendsSample) : WORDS.sends;
    box.appendChild(el('p', 'reply-sends', sends));

    // The email box: above the button when there is no code, behind a link
    // under the button when there is.
    const email = el('input', 'reply-email');
    email.type = 'email';
    email.autocomplete = 'email';
    email.maxLength = 160;
    email.placeholder = WORDS.emailPlaceholder;
    email.id = `reply-email-${Math.random().toString(36).slice(2, 8)}`;
    const label = el('label', 'reply-email-label', WORDS.emailLabel);
    label.htmlFor = email.id;
    const field = el('div', 'reply-field');
    field.append(label, email, el('p', 'small', answers.invite ? WORDS.differentWhy : WORDS.emailWhy));

    const button = el('button', 'btn btn-big', v.button);
    button.type = 'button';
    const status = el('p', 'reply-status');
    status.setAttribute('role', 'status');

    if (answers.invite) {
      field.hidden = true;
      const open = el('button', 'link', WORDS.differentEmail);
      open.type = 'button';
      open.addEventListener('click', () => { field.hidden = false; open.remove(); email.focus(); });
      box.append(button, open, field, status);
    } else {
      box.append(field, button, status);
    }

    button.addEventListener('click', async () => {
      const typed = email.value.trim();
      if (typed && !EMAIL_RE.test(typed)) {
        status.textContent = WORDS.badEmail;
        email.focus();
        return;
      }
      button.disabled = true;
      status.textContent = WORDS.sending;
      const body = replyBody({ ...answers, platform }, email.value);
      let ok = false;
      try { ok = await send(body); } catch { ok = false; }
      if (ok) {
        box.replaceChildren(el('p', 'reply-after', thanks(v.after(answers.name), answers.name)));
      } else {
        status.textContent = WORDS.failed;
        button.disabled = false;
      }
    });
  }

  function ask() {
    box.appendChild(el('p', 'reply-question', WORDS.question));
    const choices = el('div', 'choices');
    for (const [id, label] of COMPUTERS) {
      const b = el('button', 'choice', label);
      b.type = 'button';
      b.addEventListener('click', () => { platform = id; render(); });
      choices.appendChild(b);
    }
    box.append(choices, el('p', 'small', WORDS.chipHelp));
  }
}

// A file with no name reads as "You": "Thanks, You." becomes "Thanks."
function thanks(line, name) {
  return name === 'You' ? line.replace(/^Thanks, You\./, 'Thanks.') : line;
}

async function post(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
  });
  return res.ok;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

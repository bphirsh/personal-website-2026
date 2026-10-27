/**
 * The signup at the end of /workspace/try: it sends Brian their email, invite code, computer, role and tools (M-005, M-007, M-010, M-013). The email box is always shown and must be filled; nothing else from their file is ever sent, and the body is built here from those fields alone.
 *
 * The line around the box changes with the computer. A file that says `mac`, `other` or `unknown` gets the question first, and the line follows the answer.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The signup".
 */

const ENDPOINT = '/api/invite-reply';
// The same check /api/invite-reply makes, so a typo is caught before sending.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

const WORDS = {
  reserve: 'Reserve my spot',
  keepPosted: 'Keep me posted', // on an Intel Mac, where the build will not run
  placeholder: 'you@example.com',
  noEmail: 'Add your email first.',
  badEmail: "That doesn't look like an email address.",
  sending: 'Sending…',
  failed: "That didn't send. Try again.",
  inLine: (name) => (name && name !== 'You' ? `You're in line, ${name}! Brian will email you.` : "You're in line! Brian will email you."),
  thanks: (name) => (name && name !== 'You' ? `Thanks, ${name}! Brian will email you.` : 'Thanks! Brian will email you.'),
  question: 'Which computer would you use Workspace on?',
  chipHelp: 'Not sure? Apple menu → About This Mac: "Chip: Apple M…" is Apple silicon.',
};

// The choices, in the copy's order, and the platform each means.
export const COMPUTERS = [
  ['mac-apple-silicon', 'Mac with Apple silicon'],
  ['mac-intel', 'Mac with Intel'],
  ['windows', 'Windows PC'],
  ['linux', 'Linux'],
  ['other', 'Something else'],
];

// The line for each computer, around the email box: "Email me at [ ] …" (M-007, M-013).
const VARIANTS = {
  'mac-apple-silicon': { after: "when it's ready!" },
  windows: { after: "when there's a Windows version!" },
  linux: { after: "if there's a Linux version!" },
  'mac-intel': { line: 'The build needs a Mac with Apple silicon (M1 or later).', after: 'if that changes!' },
  other: { after: 'with news!' },
};

// The line under the sign-up, built from what the button sends and nothing else (Page copy, M-015).
const COMPUTER_WORDS = { 'mac-apple-silicon': 'a Mac with Apple silicon', 'mac-intel': 'an Intel Mac', mac: 'a Mac', windows: 'Windows', linux: 'Linux', other: 'another computer' };
const ROLE_WORDS = { coder: 'write code', 'knowledge-worker': 'work in documents and research', both: 'work across code and documents', other: 'work across code and documents' };

/** "A", "A and B", "A, B and C", then "A, B, C and 2 more". */
function toolWords(labels) {
  if (labels.length <= 1) return labels.join('');
  if (labels.length <= 3) return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
}

/** What the sign-up tells Brian, in words, from the same fields `replyBody` sends. */
export function tellsLine({ invite, platform, role, ai_tools, knowledge_tools }) {
  const tools = [...ai_tools, ...knowledge_tools].map((t) => t.label);
  const computer = COMPUTER_WORDS[platform] ?? COMPUTER_WORDS.other;
  const does = ROLE_WORDS[role] ?? ROLE_WORDS.other;
  const along = `Along with your email${invite ? ' and invite code' : ''}`;
  return tools.length
    ? `${along}, this tells Brian you're on ${computer}, use ${toolWords(tools)}, and ${does}.`
    : `${along}, this tells Brian you're on ${computer} and ${does}.`;
}

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

  let tells = null;
  render();

  function render() {
    box.replaceChildren();
    if (!platform || !VARIANTS[platform]) return ask();
    const v = VARIANTS[platform];
    if (v.line) box.appendChild(el('p', 'reply-line', v.line));

    // One line, the email box always shown (M-013): "Email me at [box] when it's ready!" and Notify. A form, so Return sends it too.
    const form = el('form', 'reply-form');
    form.noValidate = true;
    const email = el('input', 'reply-email');
    email.type = 'email';
    email.autocomplete = 'email';
    email.maxLength = 160;
    email.required = true;
    email.placeholder = WORDS.placeholder;
    const sentence = el('label', 'reply-sentence');
    sentence.append(el('span', null, 'Email me at'), email, el('span', null, v.after));
    const button = el('button', 'btn btn-big', platform === 'mac-intel' ? WORDS.keepPosted : WORDS.reserve);
    button.type = 'submit';
    form.append(sentence, button);
    const status = el('p', 'reply-status');
    status.setAttribute('role', 'status');
    // Under the sign-up: what it tells Brian, in words, from their own answers (M-015).
    tells = el('p', 'reply-tells', tellsLine({ ...answers, platform }));
    box.append(form, status, tells);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const typed = email.value.trim();
      if (!typed || !EMAIL_RE.test(typed)) {
        status.textContent = typed ? WORDS.badEmail : WORDS.noEmail;
        email.focus();
        return;
      }
      button.disabled = true;
      status.textContent = WORDS.sending;
      const body = replyBody({ ...answers, platform }, typed);
      let ok = false;
      try { ok = await send(body); } catch { ok = false; }
      if (ok) {
        box.replaceChildren(el('p', 'reply-after', platform === 'mac-intel' ? WORDS.thanks(answers.name) : WORDS.inLine(answers.name)));
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

  // The taps change role and tools without rebuilding the sign-up; this redraws the line under it.
  return { refresh: () => { if (tells?.isConnected) tells.textContent = tellsLine({ ...answers, platform }); } };
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

/**
 * The signup at the end of /workspace/try: it sends Brian their email, invite code, computer, role (only when their file said one) and tools (M-005, M-007, M-010, M-013). The email box must be filled; nothing else from their file is ever sent, and the body is built here from those fields alone.
 *
 * Email first (Brian, 27 Oct 2026): at first only the email line and box. Once the email looks complete (an @, then a . after it), the questions their file didn't answer slide in below it, the computer then the AI tools, and then the button. A file that answered both gets the button with the email alone. There is no question about their work. The line around the box changes with the computer; before it is known, it is the Apple silicon line.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The signup".
 */

import { KNOWN, DISPLAY } from './invite.js';

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
  tools: 'Which AI tools do you use most?',
  somethingElse: 'Something else',
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

/** What the sign-up tells Brian, in words, from the same fields `replyBody` sends. With no role, ", and {role}" is left out. */
export function tellsLine({ invite, platform, role, ai_tools, knowledge_tools }) {
  const tools = [...ai_tools, ...knowledge_tools].map((t) => t.label);
  const computer = COMPUTER_WORDS[platform] ?? COMPUTER_WORDS.other;
  const along = `Along with your email${invite ? ' and invite code' : ''}`;
  if (!role) return tools.length ? `${along}, this tells Brian you're on ${computer} and use ${toolWords(tools)}.` : `${along}, this tells Brian you're on ${computer}.`;
  const does = ROLE_WORDS[role] ?? ROLE_WORDS.other;
  return tools.length
    ? `${along}, this tells Brian you're on ${computer}, use ${toolWords(tools)}, and ${does}.`
    : `${along}, this tells Brian you're on ${computer} and ${does}.`;
}

/**
 * The body the button sends: exactly these fields, `role` only when their file said one, `email` only when typed.
 * A tool is sent by its id when known, else as written.
 */
export function replyBody({ invite, platform, role, ai_tools, knowledge_tools }, email) {
  const ids = (list) => list.map((t) => (t.known ? t.id : t.label));
  const body = { invite: invite ?? 'none', platform };
  if (role) body.role = role;
  body.ai_tools = ids(ai_tools);
  body.knowledge_tools = ids(knowledge_tools);
  const typed = String(email ?? '').trim();
  if (typed) body.email = typed;
  return body;
}

/**
 * Build the sign-up into `mount`.
 *
 * `answers` holds invite (or null), name, platform, role (null when their file
 * said none), ai_tools and knowledge_tools as invite.js reads them; the
 * example passes no platform and no tools, so both are asked. `options.send`
 * replaces the network call, for tests.
 */
export function mountButton(mount, answers, options = {}) {
  const box = el('section', 'reply');
  mount.replaceChildren(box);
  const send = options.send ?? post;
  // What is asked: the computer when the file's platform has no line of its own (`mac`, `other`, `unknown`, none); the tools when the file named none.
  const askComputer = !VARIANTS[answers.platform];
  const askTools = !answers.ai_tools?.length;
  let platform = askComputer ? null : answers.platform;
  const tools = new Set();
  const live = () => ({
    ...answers,
    platform,
    ai_tools: askTools ? [...tools].map((id) => (id === 'other' ? { id: 'other', label: 'other', known: false } : { id, label: DISPLAY[id] ?? id, known: true })) : answers.ai_tools,
  });

  // The line above the box (Intel only) and the words after it follow the computer; before it is known, the Apple silicon line.
  const lineAbove = el('p', 'reply-line');
  const form = el('form', 'reply-form');
  form.noValidate = true;
  const email = el('input', 'reply-email');
  email.type = 'email';
  email.autocomplete = 'email';
  email.maxLength = 160;
  email.required = true;
  email.placeholder = WORDS.placeholder;
  const after = el('span');
  const sentence = el('label', 'reply-sentence');
  sentence.append(el('span', null, 'Email me at'), email, after);
  const button = el('button', 'btn btn-big');
  button.type = 'submit';
  form.appendChild(sentence);

  // The questions their file didn't answer, then the button; they come in once the email looks complete.
  const more = el('div', 'reply-more');
  more.hidden = true;
  if (askComputer) more.appendChild(computerQuestion());
  if (askTools) more.appendChild(toolsQuestion());
  const status = el('p', 'reply-status');
  status.setAttribute('role', 'status');
  const tells = el('p', 'reply-tells');
  box.append(lineAbove, form, more, status, tells);
  sync();

  // An @, then a . after it: enough to show the rest; the full check is at sending.
  const looksComplete = (v) => /@[^@]*\./.test(v);
  email.addEventListener('input', () => {
    if (more.hidden && looksComplete(email.value)) { more.hidden = false; sync(); }
  });

  function sync() {
    const v = VARIANTS[platform ?? 'mac-apple-silicon'];
    lineAbove.textContent = v.line ?? '';
    lineAbove.hidden = !v.line;
    after.textContent = v.after;
    button.textContent = platform === 'mac-intel' ? WORDS.keepPosted : WORDS.reserve;
    // The button once there is nothing left that must be answered: with the email alone when nothing is asked, else after the email looks complete and the computer is chosen. The tools are any number, none included.
    const ready = !askComputer && !askTools ? true : !more.hidden && !!platform;
    if (ready && !button.isConnected) (askComputer || askTools ? more : form).appendChild(button);
    if (!ready) button.remove();
    tells.hidden = !ready;
    if (ready) tells.textContent = tellsLine(live());
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  button.addEventListener('click', (e) => { if (!form.contains(button)) { e.preventDefault(); submit(); } });

  async function submit() {
    // Return in the box before the computer is chosen brings the questions in rather than sending.
    if (!button.isConnected) { more.hidden = false; sync(); return; }
    const typed = email.value.trim();
    if (!typed || !EMAIL_RE.test(typed)) {
      status.textContent = typed ? WORDS.badEmail : WORDS.noEmail;
      email.focus();
      return;
    }
    button.disabled = true;
    status.textContent = WORDS.sending;
    const body = replyBody(live(), typed);
    let ok = false;
    const report = (why) => { box.dataset.failure = why; console.warn('invite-reply did not send:', why); };
    try { ok = await send(body, report); } catch { ok = false; }
    if (ok) {
      box.replaceChildren(el('p', 'reply-after', platform === 'mac-intel' ? WORDS.thanks(answers.name) : WORDS.inLine(answers.name)));
    } else {
      status.textContent = WORDS.failed;
      button.disabled = false;
    }
  }

  function computerQuestion() {
    const q = el('div', 'tap');
    q.setAttribute('role', 'group');
    q.appendChild(el('p', 'tap-question', WORDS.question));
    const row = el('div', 'choices');
    for (const [id, label] of COMPUTERS) {
      const b = el('button', 'choice', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        for (const other of row.children) other.setAttribute('aria-pressed', String(other === b));
        platform = id;
        sync();
      });
      row.appendChild(b);
    }
    q.append(row, el('p', 'small', WORDS.chipHelp));
    return q;
  }

  // Any number of tools, as chips.
  function toolsQuestion() {
    const q = el('div', 'tap');
    q.setAttribute('role', 'group');
    q.appendChild(el('p', 'tap-question', WORDS.tools));
    const row = el('div', 'choices');
    for (const [id, label] of [...KNOWN.ai_tools.map((t) => [t, DISPLAY[t]]), ['other', WORDS.somethingElse]]) {
      const b = el('button', 'choice', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const on = !tools.has(id);
        if (on) tools.add(id); else tools.delete(id);
        b.setAttribute('aria-pressed', String(on));
        sync();
      });
      row.appendChild(b);
    }
    q.appendChild(row);
    return q;
  }

  return { refresh: sync };
}

/**
 * Send the reply. Same-origin credentials, the fetch default: the site sets no cookies of its own, and on a protected Vercel preview the visitor's sign-in cookie is what lets the request reach the function at all. With `credentials: 'omit'` every preview send was answered by Vercel's protection with a 401 and never reached /api/invite-reply (27 Oct 2026).
 *
 * Which way a send failed is kept on the section, and in the console, so the next failure names its own cause: `network` (no answer), `protected` (Vercel's 401 page), or `http-<status>` with the endpoint's `upstream` code when Resend refused it. None of it holds anything the person typed.
 */
async function post(body, report = () => {}) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    report('network');
    return false;
  }
  if (res.ok) return true;
  let detail = '';
  try {
    const json = await res.json();
    if (json?.error?.message === 'Protected deployment' || json?.protection) detail = 'protected';
    else if (json?.upstream) detail = `upstream-${json.upstream}`;
  } catch { /* not JSON */ }
  report(detail === 'protected' ? 'protected' : `http-${res.status}${detail ? ` ${detail}` : ''}`);
  return false;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * The three taps at the end of the sample: computer, work, AI tools. The
 * sample is Sam's file, not theirs, so the answers come from here instead, and
 * they feed the same button a dropped file's properties do (button.js).
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "Example data, and the three taps".
 */

import { mountButton, COMPUTERS } from './button.js';
import { KNOWN, DISPLAY } from './invite.js';

const WORDS = {
  heading: 'Where do you stand?',
  computer: 'Your computer?',
  work: 'Your work?',
  tools: 'Your AI tools?',
  somethingElse: 'Something else',
};

const WORK = [['coder', 'Code'], ['knowledge-worker', 'Documents and research'], ['both', 'Both']];

/**
 * Build the taps into `mount`. `invite` is the code from the link, or null.
 * The button appears once the computer and the work are answered; tools are
 * any number, none included.
 */
export function mountTaps(mount, invite) {
  const answers = { platform: null, role: null, tools: new Set() };
  const section = el('section', 'taps');
  section.appendChild(el('h2', 'taps-head', WORDS.heading));

  const reply = el('div', 'taps-reply');

  section.append(
    question(WORDS.computer, COMPUTERS, (id) => { answers.platform = id; update(); }),
    question(WORDS.work, WORK, (id) => { answers.role = id; update(); }),
    toolChips(),
    reply,
  );
  mount.replaceChildren(section);

  // What the button reads when pressed: the role and tools as they are then,
  // so changing them never rebuilds the button or clears a typed email. Only
  // a new computer does, since it changes the button itself.
  const live = {
    invite,
    name: 'You', // no name in the sample: the thanks line reads "Thanks."
    knowledge_tools: [],
    get role() { return answers.role; },
    get ai_tools() {
      return [...answers.tools].map((id) => (id === 'other'
        ? { id: 'other', label: 'other', known: false }
        : { id, label: DISPLAY[id] ?? id, known: true }));
    },
  };
  let mounted = null;

  let handle = null;
  function update() {
    if (!answers.platform || !answers.role) return;
    if (mounted === answers.platform) { handle?.refresh(); return; }
    mounted = answers.platform;
    handle = mountButton(reply, { ...live, platform: answers.platform, get role() { return answers.role; }, get ai_tools() { return live.ai_tools; } }, { sample: true });
  }

  // One answer from a row of choices.
  function question(text, choices, pick) {
    const q = el('div', 'tap');
    q.setAttribute('role', 'group');
    q.appendChild(el('p', 'tap-question', text));
    const row = el('div', 'choices');
    for (const [id, label] of choices) {
      const b = el('button', 'choice', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        for (const other of row.children) other.setAttribute('aria-pressed', String(other === b));
        pick(id);
      });
      row.appendChild(b);
    }
    q.appendChild(row);
    return q;
  }

  // Any number of tools, as chips.
  function toolChips() {
    const q = el('div', 'tap');
    q.setAttribute('role', 'group');
    q.appendChild(el('p', 'tap-question', WORDS.tools));
    const row = el('div', 'choices');
    for (const [id, label] of [...KNOWN.ai_tools.map((t) => [t, DISPLAY[t]]), ['other', WORDS.somethingElse]]) {
      const b = el('button', 'choice', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const on = !answers.tools.has(id);
        if (on) answers.tools.add(id); else answers.tools.delete(id);
        b.setAttribute('aria-pressed', String(on));
        update();
      });
      row.appendChild(b);
    }
    q.appendChild(row);
    return q;
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * The agent replay: an agent working on one side, a Workspace window on the
 * other that changes as the files do — a task ticked in tasks.md, a new page
 * in the left bar, a row added to a database — built from the person's own
 * project and tools.
 *
 * M-006: the agent is outside the app. It is drawn only in its own panel,
 * never in the window; the window just shows files changing, marked the way
 * the app marks a change from outside. The whole thing is scripted, and the
 * label saying so stays on screen while it plays and after it stops.
 *
 * It runs on a copy of the demo, so the window above it stays as they left it.
 * Words are from Marketing/Beta Signups/Page copy.md, "The replay".
 */

import { mountDemo } from './demo.js';

const WORDS = {
  label: 'Replay: an example of an agent working on your files. Scripted, not live.',
  agent: 'Claude, working in your project folder',
  tick: (task) => `Ticks "${task}" in tasks.md`,
  page: (project) => `Writes a new page: "Notes on ${project}"`,
  row: (db) => `Adds a row to ${db}`,
  end: "Workspace didn't run the agent. It just saw the files change.",
  again: 'Play again',
  skip: 'Skip', // not in the page copy yet
};

const STEP_MS = 1800;
const FIRST_MS = 900;

/** Build the replay into `mount` for a read invite. */
export function mountReplay(mount, invite, fileName, fileText) {
  const section = el('section', 'replay');
  section.setAttribute('aria-label', 'Replay');
  section.appendChild(el('p', 'replay-label', WORDS.label));

  const stage = el('div', 'replay-stage');
  const agent = el('div', 'agent');
  const glyph = el('div', 'agent-glyph');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.append(el('span', 'agent-prompt', '>'), el('span', 'agent-cursor'));
  const caption = el('p', 'agent-caption', WORDS.agent);
  const steps = el('ol', 'agent-steps');
  agent.append(glyph, caption, steps);

  const screen = el('div', 'replay-screen');
  stage.append(agent, screen);
  section.appendChild(stage);

  const foot = el('div', 'replay-foot');
  const end = el('p', 'replay-end', WORDS.end);
  const again = el('button', 'btn', WORDS.again);
  again.type = 'button';
  const skip = el('button', 'link', WORDS.skip);
  skip.type = 'button';
  foot.append(end, again, skip);
  section.appendChild(foot);
  mount.replaceChildren(section);

  const { properties: p } = invite;
  let timers = [];
  let demo;

  function script() {
    const task = demo.firstOpenTask();
    const target = demo.rowTarget();
    const tool = p.ai_tools[0]?.label ?? 'Claude';
    return [
      task && { caption: WORDS.tick(task.text), run: () => demo.tick(task) },
      { caption: WORDS.page(p.project), run: () => demo.addPage(`Notes on ${p.project}`, notesBody(p, tool)) },
      { caption: WORDS.row(target.db.name), run: () => demo.addRow(target, rowFor(target.db, p, tool)) },
    ].filter(Boolean);
  }

  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    demo = mountDemo(screen, invite, fileName, fileText, { above: false, hints: false, label: 'Workspace, in the replay' });
    demo.show(demo.start);
    steps.replaceChildren();
    section.classList.remove('ended');
    section.classList.add('playing');
  }

  function finish() {
    timers.forEach(clearTimeout);
    timers = [];
    section.classList.remove('playing');
    section.classList.add('ended');
  }

  function play() {
    reset();
    const list = script();
    list.forEach((step, i) => {
      timers.push(setTimeout(() => {
        step.run();
        steps.appendChild(el('li', null, step.caption));
        if (i === list.length - 1) timers.push(setTimeout(finish, STEP_MS / 2));
      }, FIRST_MS + i * STEP_MS));
    });
  }

  // Skipping lands on the end state, every change made.
  function skipToEnd() {
    if (section.classList.contains('ended')) return;
    reset();
    for (const step of script()) {
      step.run();
      steps.appendChild(el('li', null, step.caption));
    }
    finish();
  }

  // It starts when it comes into view, once; Play again runs it after that,
  // and skipping first means it never starts by itself.
  const seen = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { seen.disconnect(); play(); }
  }, { threshold: 0.4 });
  again.addEventListener('click', () => { seen.disconnect(); play(); });
  skip.addEventListener('click', () => { seen.disconnect(); skipToEnd(); });

  reset();
  seen.observe(section);

  return { play, skip: skipToEnd };
}

// The new page: their project and their tools.
function notesBody(p, tool) {
  const tools = [...p.ai_tools, ...p.knowledge_tools].map((t) => t.label);
  return [
    `## ${p.project}`,
    `- Written by ${tool}`,
    tools.length ? `- Tools: ${tools.join(', ')}` : null,
  ].filter(Boolean).join('\n');
}

// A row that fits the table: their project and tool where a column asks for them.
function rowFor(db, p, tool) {
  const month = new Date().toISOString().slice(0, 7);
  return db.columns.map((c, i) => {
    if (i === 0) return db.name === 'Tools' ? tool : `Notes on ${p.project}`;
    if (/tool/i.test(c)) return tool;
    if (/kind/i.test(c)) return 'AI tool';
    if (/status|stage/i.test(c)) return 'New';
    if (/start|date|contact|when/i.test(c)) return month;
    return '';
  });
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * The agent replay: an agent working on one side, a Workspace window on the
 * other that changes as the files do — a task ticked in tasks.md, a new page
 * in the left bar, a row added to a database — built from the person's own
 * project and tools.
 *
 * M-006: the agent is outside the app. It is drawn only in its own panel, never in the window; the window just shows files changing, marked the way the app marks a change from outside. It is scripted. M-013 (Brian, 27 Oct) took away its "Replay" label and its closing line, and it starts only once most of it is on screen.
 *
 * It runs on a copy of the demo, so the window above it stays as they left it.
 * Words are from Marketing/Beta Signups/Page copy.md, "The replay".
 */

import { mountDemo } from './demo.js';

const WORDS = {
  agent: 'Claude, in your project folder',
  tick: (task) => `Ticks "${task}"`,
  page: (project) => `Writes "Notes on ${project}"`,
  row: (db) => `Adds a row to ${db}`,
  again: 'Play again',
};

const STEP_MS = 1800;
const FIRST_MS = 900;
// How much of the replay must be on screen before it starts (Brian: "mostly onto that section").
export const START_SHARE = 0.6;

/**
 * How much of a section is on screen, as a share of what could be: its own height, or the screen's when the section is taller than the screen (on a phone it is), so a tall section can still reach the share.
 */
export function visibleShare(sectionHeight, visibleHeight, screenHeight) {
  const most = Math.min(sectionHeight, screenHeight);
  return most > 0 ? Math.min(1, visibleHeight / most) : 0;
}

/** Build the replay into `mount` for a read invite. */
export function mountReplay(mount, invite, fileName, fileText) {
  const section = el('section', 'replay');
  section.setAttribute('aria-label', 'An agent working on your files');

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

  // When it ends, the stage grays out with Play again over it (M-014; Skip is gone).
  const over = el('div', 'replay-over');
  const again = el('button', 'btn btn-big', WORDS.again);
  again.type = 'button';
  over.appendChild(again);
  stage.appendChild(over);
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
    demo = mountDemo(screen, invite, fileName, fileText, { above: false, label: 'Workspace, in the replay' });
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
    // With reduced motion the steps come quicker and nothing in them moves (the CSS holds the tint still and stops the cursor).
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stepMs = reduced ? 900 : STEP_MS;
    const firstMs = reduced ? 300 : FIRST_MS;
    section.dataset.started = String(Math.round(performance.now())); // when it began, for the scroll check
    const list = script();
    list.forEach((step, i) => {
      timers.push(setTimeout(() => {
        step.run();
        steps.appendChild(el('li', null, step.caption));
        if (i === list.length - 1) timers.push(setTimeout(finish, stepMs / 2));
      }, firstMs + i * stepMs));
    });
  }

  // It starts once, when most of it is on screen; Play again runs it after that.
  const steps20 = Array.from({ length: 21 }, (_, i) => i / 20);
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const share = visibleShare(e.boundingClientRect.height, e.intersectionRect.height, e.rootBounds?.height ?? innerHeight);
      section.dataset.share = share.toFixed(2); // read by the scroll check
      if (share >= START_SHARE) { seen.disconnect(); play(); return; }
    }
  }, { threshold: steps20 });
  again.addEventListener('click', () => { seen.disconnect(); play(); });

  reset();
  seen.observe(section);

  return { play, finish };
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

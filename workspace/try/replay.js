/**
 * The agent replay: an agent working on one side, a Workspace window on the
 * other that changes as the files do — a task ticked in tasks.md, a new page
 * in the left bar, a row added to a database — built from the person's own
 * project and tools.
 *
 * M-006: the agent is outside the app. It is drawn only in its own panel, never in the window; the window just shows files changing, marked the way the app marks a change from outside. It is scripted. M-013 (Brian, 27 Oct) took away its "Replay" label and its closing line; it starts only once most of it is on screen, and since M-015 it loops on its own, with no button.
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
};

const STEP_MS = 1800;
const FIRST_MS = 900;
// The loop (M-015): how long the end holds, and how long the fade out (and back in) takes.
const LOOP_HOLD_MS = 1800;
const FADE_MS = 400;
// Below this share on screen, the loop stops.
const STOP_SHARE = 0.15;
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

  mount.replaceChildren(section);

  const { properties: p } = invite;
  let timers = [];
  let demo;
  let running = false; // a run, or the pause and fade between runs, is under way
  let runs = 0;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    demo = mountDemo(screen, invite, fileName, fileText, { above: false, label: 'Workspace, in the replay' });
    demo.show(demo.start);
    steps.replaceChildren();
    section.classList.remove('ended', 'fading');
  }

  // One run: the three changes, one after another.
  function play() {
    reset();
    running = true;
    section.classList.add('playing');
    section.dataset.runs = String(++runs); // read by the loop check
    const list = script();
    list.forEach((step, i) => {
      later(() => {
        step.run();
        steps.appendChild(el('li', null, step.caption));
        if (i === list.length - 1) later(loop, LOOP_HOLD_MS);
      }, FIRST_MS + i * STEP_MS);
    });
  }

  // It loops on its own (M-015): hold the end, fade out, fade back in at the start, and play again.
  function loop() {
    section.classList.add('fading');
    later(() => { play(); }, FADE_MS);
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    running = false;
    section.classList.remove('playing', 'fading');
  }

  // With reduced motion it neither plays on its own nor loops: it shows what the agent changed, all at once and still.
  function still() {
    reset();
    for (const step of script()) {
      step.run();
      steps.appendChild(el('li', null, step.caption));
    }
    section.classList.add('ended');
  }

  // It starts once most of it is on screen, and stops looping when it is scrolled away; back on screen, it starts again from the beginning.
  const steps20 = Array.from({ length: 21 }, (_, i) => i / 20);
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const share = visibleShare(e.boundingClientRect.height, e.intersectionRect.height, e.rootBounds?.height ?? innerHeight);
      section.dataset.share = share.toFixed(2); // read by the scroll check
      if (reduced()) continue;
      if (share >= START_SHARE && !running) {
        play();
      } else if (share < STOP_SHARE && running) {
        stop();
      }
    }
  }, { threshold: steps20 });

  // With reduced motion nothing moves, so there is nothing to wait for: it shows the finished state at once.
  if (reduced()) still();
  else reset();
  seen.observe(section);

  return { play, stop, still };
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

/**
 * "Get my file" (M-017): copies the page's version of the agent prompt to the clipboard, so someone without the email can still make their own invite file, then says to paste it into their agent. If the browser refuses the clipboard, the prompt is shown in a box to select.
 *
 * The prompt is shipped with the page (prompt-data.js, from Prompt.md), and filled here by Prompt.md's own rule. With a code from the link's `#`, `{code}` is replaced in all three places. Without one, the template's invite line and the rule that copies it are deleted, and the link loses its `#`. The copied text then never holds a `{`. Nothing is sent anywhere.
 *
 * Since the one-screen landing (Brian, 27 Oct 2026) the button is a card showing the prompt's first lines (`peek`), so it reads as copying a prompt.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The drop zone".
 */

import { PAGE_PROMPT } from './prompt-data.js';

const WORDS = {
  failed: "Couldn't copy. Select the prompt and copy it yourself.",
};

const TRY_LINK = 'https://www.brianhirsh.com/workspace/try';

/** `?h=a&event=slug` for the prompt's try link: what this visit carries back when they return with their file (headline.js, 3 Nov 2026). Empty when there is nothing to carry. */
export function carryQuery({ headline, event } = {}) {
  const q = new URLSearchParams();
  if (headline) q.set('h', headline);
  if (event) q.set('event', event);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** The prompt to copy, for a code (`07-k3f9`) or none, its try link carrying `carry` ({ headline, event }) before the `#`. */
export function fillPrompt(code, prompt = PAGE_PROMPT, carry = {}) {
  prompt = prompt.replaceAll(`${TRY_LINK}#{code}`, `${TRY_LINK}${carryQuery(carry)}#{code}`);
  if (code) return prompt.replaceAll('{code}', code);
  return prompt
    .split('\n')
    // The rule line has read "Copy the invite line exactly as written: …" and, since M-020, "Copy the invite line exactly: …"; either goes.
    .filter((line) => line.trim() !== 'invite: {code}' && !/Copy the invite line exactly( as written)?: invite: \{code\}/.test(line))
    .join('\n')
    .replaceAll(/(https:\/\/www\.brianhirsh\.com\/workspace\/try[^#\s]*)#\{code\}/g, '$1');
}

/** The first lines of the prompt, for the card to show. */
export function peek(code, lines = 4) {
  return fillPrompt(code).split('\n').filter((l) => l.trim()).slice(0, lines).join('\n');
}

/**
 * Wire the button: `button` copies (with `carry()`'s headline and event in its try link), `status` says what happened, and a box for the prompt is added after `status` when copying is refused. `code()` gives the code at the moment of pressing, and `after(ok)`, when given, runs once either way, `ok` saying whether it copied (the page moves to its second step only then).
 */
export function wireGetFile(button, status, code, after, carry = () => ({})) {
  let box = null;
  button.addEventListener('click', async () => {
    const text = fillPrompt(code(), PAGE_PROMPT, carry());
    let ok = false;
    box?.remove();
    box = null;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      status.textContent = '';
      ok = true;
    } catch {
      status.textContent = WORDS.failed;
      box = document.createElement('textarea');
      box.className = 'prompt-box';
      box.readOnly = true;
      box.value = text;
      box.rows = 10;
      box.setAttribute('aria-label', 'The prompt');
      status.after(box);
      box.focus();
      box.select();
    }
    after?.(ok);
  });
}

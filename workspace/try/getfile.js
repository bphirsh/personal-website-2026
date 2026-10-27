/**
 * "Get my file" (M-017): copies the page's version of the agent prompt to the clipboard, so someone without the email can still make their own invite file, then says to paste it into their agent. If the browser refuses the clipboard, the prompt is shown in a box to select.
 *
 * The prompt is shipped with the page (prompt-data.js, from Prompt.md), and filled here by Prompt.md's own rule. With a code from the link's `#`, `{code}` is replaced in all three places. Without one, the template's invite line and the rule that copies it are deleted, and the link loses its `#`. The copied text then never holds a `{`. Nothing is sent anywhere.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The drop zone".
 */

import { PAGE_PROMPT } from './prompt-data.js';

const WORDS = {
  copied: 'Copied! Paste it into Claude, ChatGPT or any agent, then drop the file it makes here.',
  failed: "Couldn't copy. Select the prompt below and copy it yourself.",
};

/** The prompt to copy, for a code (`07-k3f9`) or none. */
export function fillPrompt(code, prompt = PAGE_PROMPT) {
  if (code) return prompt.replaceAll('{code}', code);
  return prompt
    .split('\n')
    .filter((line) => line.trim() !== 'invite: {code}' && !line.includes('Copy the invite line exactly as written: invite: {code}'))
    .join('\n')
    .replaceAll('https://www.brianhirsh.com/workspace/try#{code}', 'https://www.brianhirsh.com/workspace/try');
}

/**
 * Wire the button: `button` copies, `status` says what happened, and a box for the prompt is added after `status` when copying is refused. `code()` gives the code at the moment of pressing.
 */
export function wireGetFile(button, status, code) {
  let box = null;
  button.addEventListener('click', async () => {
    const text = fillPrompt(code());
    box?.remove();
    box = null;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      status.textContent = WORDS.copied;
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
  });
}

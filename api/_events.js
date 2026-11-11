/**
 * Event-tagged sign-ups (row "Same-day follow-up for event sign-ups", 3 Nov 2026).
 *
 * A QR link at a talk carries `?event=<slug>` (made by tools/event-qr.mjs). The access page and the try page pass it on with the sign-up, as they read it from their own address (no cookie, no storage); /api/signup and /api/invite-reply read it with eventSlug, save it on the Resend contact as the `event` property, put it in my email, and open the confirmation with "Great to meet you at <event name>!". tools/sync-signups.mts writes the event's name into the Signups database's "Met at".
 *
 * A slug that isn't one is ignored, never refused: a mangled link must not cost a sign-up.
 *
 * Files starting with "_" in api/ are not deployed as endpoints.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 48;

/** Names for events whose slug doesn't read well on its own. Add one when a slug's readable form is wrong. */
const EVENT_NAMES = { 'fractal-demo-party': "Fractal's Weekly Demo Party" };

/**
 * Slugs that name a place on the site rather than an event (9 Nov 2026): a sign-up from there is tagged the same way (the contact's `event`, "Met at" in Signups), but its confirmation has no "Great to meet you at …" line. The download page's new-build box sends "download-page".
 */
const PLACES = { 'download-page': 'Download page' };

/** Whether this slug is a place on the site rather than an event. */
function isPlace(slug) {
  return typeof slug === 'string' && Object.prototype.hasOwnProperty.call(PLACES, slug);
}

const MONTHS = new Set(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);
// Words written in capitals rather than capitalised.
const UPPER = new Set(['ai', 'ml', 'llm', 'ux', 'ui', 'nyc', 'sf', 'la', 'dc', 'uk', 'us', 'mit', 'api', 'js']);

/** The event's slug from a sign-up's `event`, or null when there is none or it isn't one. */
function eventSlug(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s && s.length <= MAX_SLUG && SLUG_RE.test(s) ? s : null;
}

/** "ai-tinkerers-nov" → "AI Tinkerers": from EVENT_NAMES, else the slug's words capitalised, with a trailing month or year left off. */
function eventName(slug) {
  if (isPlace(slug)) return PLACES[slug];
  if (Object.prototype.hasOwnProperty.call(EVENT_NAMES, slug)) return EVENT_NAMES[slug];
  const words = slug.split('-');
  while (words.length > 1 && (MONTHS.has(words[words.length - 1]) || /^(19|20)\d\d$/.test(words[words.length - 1]))) words.pop();
  return words.map((w) => (UPPER.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

module.exports = { eventSlug, eventName, isPlace, EVENT_NAMES, PLACES };

# Workspace dev build — backend

Four Vercel serverless functions that power `/workspace/signup/`, `/workspace/download/` and `/workspace/try/`. They deploy with `git push`, exactly like the rest of the site.

| Endpoint | Does |
|---|---|
| `GET /api/download` | The download button: counts the click (date and version only) and 302-redirects to the newest `.dmg` named by the release feed. `?info=1` returns `{ version, size, url }` instead, uncounted |
| `GET /api/download-count` | `{ total, byDay, byVersion, counting }`: how many times the button was pressed. Read it with `node tools/download-count.mjs` |
| `POST /api/signup` | The new-build email: validates an email, computer, optional name and agents; adds them to the Resend beta list and sends them the confirmation; emails it all to you |
| `POST /api/invite-reply` | The button on `/workspace/try`: adds their email to the beta list with the confirmation, and emails you their email, invite code (from a personal `/workspace/try/#05-xxxx` link), computer, role and tools |

**The download is public (9 Nov 2026).** The build is signed and notarized, so there is no password any more: `/api/download-auth` and `BETA_PASSWORD` are retired, and every Download button goes to `/workspace/download/`, whose button is `/api/download`. The old `/workspace/beta-download` URL still redirects to the download page.

## Why it's built this way

This is deliberately throwaway infrastructure — a handful of friends, a month or two, then a separate system at launch. Every choice below optimises for *least setup*, not for scale or elegance.

- **The list is Resend's** (M-027, 30 Oct 2026). Each sign-up becomes a contact in the "Beta" segment, with `computer` and `agents` properties, and gets the confirmation email (`_beta-list.js`, `_confirmation.js`; files starting with `_` are not endpoints). `tools/sync-signups.sh` copies the list into the Signups database on Brian's Mac once a day. If Resend fails at the list or the confirmation, your email still goes and says what failed.
- **Event links** (3 Nov 2026). A QR link from `tools/event-qr.mjs <slug>` opens the sign-up page (or, with `--try`, the try page) with `?event=<slug>`. The page sends the slug with the sign-up; it is saved as the contact's `event` property, named in your email, opens the confirmation with "Great to meet you at <event>!", and becomes "Met at" in Signups. Names come from `_events.js` (the slug made readable, or `EVENT_NAMES`). A bad slug is dropped, never refused. `PLACES` in `_events.js` holds slugs that are a place on the site rather than an event: the download page's new-build box sends `event: "download-page"`, so those sign-ups are tagged in Resend and show "Download page" in Signups' "Met at", but their confirmation has no "Great to meet you" line. That box sends an email only (no name; the computer is "Mac with Apple silicon", since it's the download page), so the name is optional in `/api/signup` since 9 Nov 2026; the sign-up page still asks for one.
- **Two headlines** (3 Nov 2026). The try page shows one of two landing headlines (`workspace/try/headline.js`, from Marketing/Growth/Story.md), picked at random per visit and kept in memory only; the copied prompt's try link carries it back as `?h=` (with `&event=` when the visit had one), so the return visit shows and sends the same one. Its sign-up sends `headline` ("a" or "b"), saved as the contact's `headline` property and shown in your email, so the split is read from Resend. The sign-up page is unchanged.
- **No npm dependencies.** Resend and Vercel Blob are called over their REST APIs with plain `fetch`, so there's no `package.json` in the repo and the site stays a zero-config static deploy. Nothing about the existing build changed.
- **Same origin.** The pages call `/api/...` on their own domain, so there is no CORS configuration anywhere.
- **The build is not streamed through a function.** At ~155MB that would risk the function timeout on a slow connection and bill the bandwidth twice. `/api/download` redirects to `releases.brianhirsh.com` (Cloudflare) instead, and the browser downloads directly.
- **The download follows the release feed.** `/api/download` reads `https://releases.brianhirsh.com/latest-mac.yml`, the same file the app's updater reads, and redirects to the `.dmg` it names (`_downloads.js`). It's kept in memory for a minute and read with a 2.5-second timeout; if the feed can't be read, the last one read is used, or else a fallback hard-coded in `_downloads.js` (`Workspace-1.1.3-arm64.dmg`, current on 9 Nov 2026). So shipping a new build needs nothing here: publish it to the feed and the button follows within a minute. The download page shows the version and size from `/api/download?info=1`, since the feed's host doesn't let a page read it directly. Only a bare file name from the feed is accepted, always on the releases host.

## Counting downloads

Every GET to `/api/download` records one click, with no identity: no IP address, user agent, cookie, referrer or anything else about the person, only the date (UTC) and the version. **It counts presses of the button, not finished downloads or installs.** A HEAD (link previews, prefetchers) isn't counted; bots that follow links can be. The app's own update checks and downloads go to the feed directly and aren't counted.

- **Where:** Vercel Blob, one tiny object per click, named `downloads/<date>/<version>-<12 random hex>.txt` with the body `1`. One object per click means two clicks at once never overwrite each other (no read-modify-write). Example: `downloads/2026-11-09/1.1.3-8ddf6f638452.txt`.
- **Why Blob:** it's already set up for this project (the old `.dmg` lived there), it's free on Hobby, it survives deploys and cold starts, and it needs no new account. Cloudflare KV or D1 would need a Worker and a second set of keys.
- **How it's called:** over Blob's REST API with `fetch`, not the `@vercel/blob` package, so no `package.json` is added (see *No npm dependencies*). The calls are the ones `@vercel/blob` 2.8.2 makes, read from its published source on 9 Nov 2026: `PUT https://vercel.com/api/blob/?pathname=<p>` to store and `GET https://vercel.com/api/blob?prefix=downloads/&limit=1000&cursor=<c>` to list, with `authorization: Bearer <token>`, `x-api-version: 13` and `x-vercel-blob-store-id` (the fourth `_`-separated part of the token). If Vercel changes that API, `tools/check-download.mjs` still passes (it's stubbed), so after a Blob upgrade press the button once and read the count.
- **Switched on by `BLOB_READ_WRITE_TOKEN`.** Vercel adds it when a Blob store is connected to the project (Storage → the store → Connect). Without it nothing is counted, the redirect works as normal, one line is logged, and `/api/download-count` says `"counting": false`.
- **Never in the way:** the count is awaited for at most 1.5 seconds; a refused, slow or broken store still redirects.
- **Reading it:** `node tools/download-count.mjs` prints the total, by day and by version, from production. `/api/download-count` is public (it holds only dates and versions) and cached at the edge for a minute, so reading it often can't run up Blob operations.
- **Cost:** each click is one Blob write, and each uncached count read is one list per 1,000 clicks. Both are "advanced operations" in Vercel's Blob pricing, which has a monthly free allowance on Hobby; check the Usage page if downloads grow into the thousands a month.

## Setup

### 1. Connect a Blob store, for the click count

Vercel dashboard → **Storage** → the Blob store (or create one) → **Connect** to this project. That adds `BLOB_READ_WRITE_TOKEN`. The build itself no longer lives in Blob: it's on `releases.brianhirsh.com`.

### 2. Get a Resend API key

Sign up at [resend.com](https://resend.com) and create an API key. The free tier is 3,000 emails/month, which is ~3,000× what this needs.

**The shared `onboarding@resend.dev` sender only delivers to the address your Resend account is registered with.** That single restriction decides what `NOTIFY_EMAIL` has to be:

- **Didn't verify a domain?** Set `NOTIFY_EMAIL` to the exact address you signed up to Resend with. Anything else returns a 403 and the signup fails.
- **Want mail from `brianhirsh.com`, or to send anywhere?** Verify the domain in Resend (it adds DNS records you enter at Namecheap), set `RESEND_FROM` to an address on it, and then `NOTIFY_EMAIL` can be whatever you like.

For a dev build the first option is fine — you're the only recipient.

### 3. Set the environment variables

Vercel dashboard → your project → **Settings → Environment Variables**:

| Variable | Value | Required |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Added by connecting the Blob store (step 1). Turns on the click count | no, but nothing is counted without it |
| `BLOB_ACCESS` | `private` if the store was made private; otherwise leave unset (public) | no |
| `RESEND_API_KEY` | From step 2 | yes |
| `NOTIFY_EMAIL` | Where signups go. **Must be your Resend account's own address** unless you verified a domain — see step 2. | yes |
| `RESEND_FROM` | The sender on the verified domain, `Brian Hirsh <brian@brianhirsh.com>`. The confirmation can't reach anyone else without it | yes, since M-027 |
| `RESEND_AUDIENCE_ID` | The "Beta" segment's id (Resend's audiences are now segments) | yes, since M-027 |

Redeploy after adding them — Vercel only picks up new variables on the next build.

`BETA_PASSWORD`, `DMG_URL`, `DMG_VERSION` and `DMG_ARCH` are no longer read by anything (9 Nov 2026) and can be deleted from Vercel.

### 4. Check it

```bash
curl -sI https://www.brianhirsh.com/api/download | grep -i -E '^(HTTP|location)'
curl -s 'https://www.brianhirsh.com/api/download?info=1'
node tools/download-count.mjs
```

The first should be a `302` to the current `.dmg` on `releases.brianhirsh.com` (a HEAD, so it isn't counted). The last should say the count, or "Not counting" if `BLOB_READ_WRITE_TOKEN` isn't set.

For the signup path, submit the form on the live page and check the email arrives. A `502` with *"I couldn't record that just now"* almost always means `NOTIFY_EMAIL` isn't the address your Resend account is registered with — the exact 403 is in the Vercel function logs.

Locally, with nothing sent anywhere: `node tools/check-download.mjs`, `node tools/check-signup.mjs`, `node tools/check-invite-reply.mjs`, `node tools/check-pages.mjs`.

## Shipping a new build

Publish it to the release feed as usual. `/api/download` follows `latest-mac.yml` within a minute, and the download page reads the version and size from it, so nothing on the site needs editing. Update `FALLBACK` in `_downloads.js` now and then, so a feed outage gives a recent build rather than an old one.

## What's public, and what isn't

- **The build is public.** Anyone can download it from the download page, with no password. It's signed and notarized, so it opens without a Gatekeeper warning.
- **The click count holds nothing about anyone.** Dates and versions only; `/api/download-count` shows exactly what's stored, added up.
- **Sign-ups are private.** Emails go to Resend's Beta segment and to you, never into a page.
- **Vercel Hobby is non-commercial.** A free beta is almost certainly fine. If Workspace becomes something you charge for while still distributing here, that's Pro territory.

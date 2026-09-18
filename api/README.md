# Workspace dev build — backend

Two Vercel serverless functions that power `/workspace/signup/` and `/workspace/download/`. They deploy with `git push`, exactly like the rest of the site.

| Endpoint | Does |
|---|---|
| `POST /api/signup` | Validates a name + email-or-phone, emails it to you |
| `POST /api/download-auth` | Checks the password, returns the build's URL |

## Why it's built this way

This is deliberately throwaway infrastructure — a handful of friends, a month or two, then a separate system at launch. Every choice below optimises for *least setup*, not for scale or elegance.

- **No database.** Signups are emailed, not stored. For a list this size an inbox is a perfectly good record, and it removes a whole service from the stack.
- **No npm dependencies.** Resend is called over its REST API with plain `fetch`, so there's no `package.json` in the repo and the site stays a zero-config static deploy. Nothing about the existing build changed.
- **Same origin.** The pages call `/api/...` on their own domain, so there is no CORS configuration anywhere.
- **The build is not streamed through a function.** At ~119MB that risks the function timeout on a slow connection and bills the bandwidth twice (Blob → function → browser). `download-auth` hands back Blob's CDN URL instead and the browser downloads directly.

## Setup

### 1. Upload the build to Vercel Blob

Vercel dashboard → **Storage** → create a Blob store → upload the `.dmg`. Copy the resulting URL.

No CLI needed. The file is ~119MB against a 1GB Hobby allowance.

### 2. Get a Resend API key

Sign up at [resend.com](https://resend.com) and create an API key. The free tier is 3,000 emails/month, which is ~3,000× what this needs.

Sending **to your own address** works immediately with Resend's shared `onboarding@resend.dev` sender, so you can skip domain verification entirely. If you'd rather the mail came from `brianhirsh.com`, verify the domain in Resend (it adds DNS records at Namecheap) and set `RESEND_FROM`.

### 3. Set the environment variables

Vercel dashboard → your project → **Settings → Environment Variables**:

| Variable | Value | Required |
|---|---|---|
| `BETA_PASSWORD` | The shared dev build password. Keeps the old name so an already-configured variable doesn't break. | yes |
| `DMG_URL` | Blob URL from step 1 | yes |
| `RESEND_API_KEY` | From step 2 | yes |
| `NOTIFY_EMAIL` | `brian@brianhirsh.com` | yes |
| `DMG_VERSION` | e.g. `0.0.1` | no |
| `DMG_ARCH` | defaults to `Apple Silicon (arm64)` | no |
| `RESEND_FROM` | only if you verified a domain | no |

Redeploy after adding them — Vercel only picks up new variables on the next build.

### 4. Check it

```bash
curl -s -X POST https://www.brianhirsh.com/api/download-auth \
  -H 'Content-Type: application/json' -d '{"password":"WRONG"}'
```

Should return `{"error":"Incorrect password."}`. Then try the real password and confirm you get a `url` back.

## Shipping a new build

Upload the new `.dmg` to Blob, then update `DMG_URL` (and `DMG_VERSION`) and redeploy. The size and build date shown on the page are read from the file itself, so they can't go stale.

## What's protected, and what isn't

Worth being precise about, since this guards a private build.

- **The password is checked server-side.** There is no password hash and no build URL in the page source — a reader of it learns nothing useful. That's the thing a client-side gate could never do.
- **A wrong password returns 401 before the build is checked**, so guessing can't be used to probe whether a build exists yet.
- **The download URL does not expire.** This is the real trade. Blob URLs are unguessable, but a tester who gets one can forward it, and it keeps working until you upload elsewhere. Acceptable for friends testing; not what you'd ship at launch. To revoke, delete the blob and upload again — every old URL dies at once.
- **There is no rate limiting.** Serverless instances share no memory, so any in-process counter is bypassed by hitting a different instance. The defence is password entropy instead: with a long random password, online guessing is hopeless. Don't replace it with something memorable.
- **One shared password.** Anyone who has it can pass it on, and you can't revoke one person. Fine at this size.
- **Vercel Hobby is non-commercial.** A free dev build for friends is almost certainly fine. If Workspace becomes something you charge for while still distributing here, that's Pro territory.

## Note on Gatekeeper

The build isn't signed, so macOS blocks the first launch. The download page documents both paths: **System Settings → Privacy & Security → Open Anyway** on macOS 15 (Sequoia) and later, and right-click → **Open** on macOS 14 and earlier. Sequoia removed the right-click bypass, so the older instruction alone would strand anyone on a current Mac.

This gets more painful as macOS tightens, not less. If the build goes beyond a few friends, joining the Apple Developer Program ($99/yr) and notarising removes the warning entirely.

/* ── Workspace API configuration ──
 *
 * The beta signup form and the beta download gate both talk to a small service
 * running on the Mac mini, exposed to the internet through a Cloudflare Tunnel.
 * Source for that service lives OUTSIDE this repo, in ../../beta-server/,
 * so the beta password is never published to GitHub Pages.
 *
 * Set API_BASE to the tunnel hostname once the tunnel is up — no trailing slash.
 * Leaving it empty puts both pages into a clearly-labelled "not configured yet"
 * state rather than failing silently.
 */
window.WORKSPACE_CONFIG = {
  API_BASE: '',

  // Shown as a fallback whenever the service can't be reached, so a visitor
  // who wants in never hits a dead end.
  CONTACT_EMAIL: 'brian@brianhirsh.com'
};

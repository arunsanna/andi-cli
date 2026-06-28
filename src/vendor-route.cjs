"use strict";
const fs = require("fs"),
  path = require("path");
const ANDI_DIR = path.resolve(__dirname, "..", "andi");
const JQUERY = path.resolve(__dirname, "vendor", "jquery-3.7.1.min.js");
const CT = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".cur": "image/x-icon",
};
async function installVendorRoutes(page, opts = {}) {
  const strictOffline = opts.strictOffline === true;
  const externalAttempts = [];
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    // Always pass through local schemes — file:, data:, blob: never leave the machine.
    if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:"))
      return route.continue();
    // ANDI's own assets (ssa.gov path) — serve from local andi/ clone.
    const m = u.match(/\/accessibility\/andi\/([^?]+)/);
    if (m) {
      const f = path.join(ANDI_DIR, m[1]);
      if (f.startsWith(ANDI_DIR + path.sep) && fs.existsSync(f))
        return route.fulfill({
          status: 200,
          contentType: CT[path.extname(f)] || "application/octet-stream",
          body: fs.readFileSync(f),
        });
      externalAttempts.push("MISSING " + u);
      return route.fulfill({ status: 404, body: "" });
    }
    // Do not intercept the target page's own jQuery or framework assets.
    // injectAndi() loads our pinned jQuery from disk before andi.js, so ANDI
    // does not need a broad network route for jQuery. A broad /jquery/ route
    // can mutate real pages and change lANDI results.
    // Everything else is the TARGET PAGE and its resources.
    // Always record the attempt so callers can inspect it.
    externalAttempts.push(u);
    // Default: let the target load normally (live-URL scanning).
    // strictOffline: block the request (hermetic / fully-offline mode).
    if (strictOffline) return route.abort("blockedbyclient");
    return route.continue();
  });
  return { externalAttempts };
}
module.exports = { installVendorRoutes, ANDI_DIR, JQUERY };

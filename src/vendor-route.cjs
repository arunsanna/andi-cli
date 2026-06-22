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
      if (f.startsWith(ANDI_DIR) && fs.existsSync(f))
        return route.fulfill({
          status: 200,
          contentType: CT[path.extname(f)] || "application/octet-stream",
          body: fs.readFileSync(f),
        });
      externalAttempts.push("MISSING " + u);
      return route.fulfill({ status: 404, body: "" });
    }
    // jQuery CDN request — serve from pinned local copy.
    if (/\/jquery[.-]/i.test(u))
      return route.fulfill({
        status: 200,
        contentType: CT[".js"],
        body: fs.readFileSync(JQUERY),
      });
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

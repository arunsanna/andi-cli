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
async function installVendorRoutes(page) {
  const externalAttempts = [];
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:"))
      return route.continue();
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
    if (/\/jquery[.-]/i.test(u))
      return route.fulfill({
        status: 200,
        contentType: CT[".js"],
        body: fs.readFileSync(JQUERY),
      });
    externalAttempts.push(u);
    return route.abort("blockedbyclient");
  });
  return { externalAttempts };
}
module.exports = { installVendorRoutes, ANDI_DIR, JQUERY };

"use strict";

const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );

const RANK = { info: 0, caution: 1, warning: 2, danger: 3 };

function toJunit(result, failOnRank = 3) {
  const groups = new Map();
  for (const f of result.findings) {
    const k = `${f.url || (result.urls && result.urls[0]) || "page"}|${f.module || f.engine}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  let body = "",
    tests = 0,
    failures = 0;
  for (const [k, fs] of groups) {
    const [url, mod] = k.split("|");
    let cases = "";
    for (const f of fs) {
      tests++;
      const fail = (RANK[f.severity] || 0) >= failOnRank;
      if (fail) failures++;
      // Guard: f.element may be null for s/h/i module findings (iframes, hidden, structures).
      // Fall back to module name when element is absent (same pattern as SARIF reporter fix).
      const tag = f.element ? f.element.tag : (f.module || f.engine || "");
      const html = f.element ? f.element.html : "";
      const enginePrefix = f.engine ? `[${f.engine}] ` : '';
      const name = esc(`${enginePrefix}${f.rule}: ${tag}`);
      const classname = esc(f.engine ? `${f.engine}/${mod}` : mod);
      cases += fail
        ? `    <testcase name="${name}" classname="${classname}"><failure message="${esc(f.message)}" type="${esc(f.severity)}">${esc(html)}</failure></testcase>\n`
        : `    <testcase name="${name}" classname="${classname}"/>\n`;
    }
    body += `  <testsuite name="${esc(url)} [${esc(mod)}]" tests="${fs.length}">\n${cases}  </testsuite>\n`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="andi-cli" tests="${tests}" failures="${failures}">\n${body}</testsuites>\n`;
}

module.exports = { toJunit };

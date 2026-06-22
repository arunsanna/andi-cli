"use strict";
const ANDI_HELP = "https://github.com/SSAgov/ANDI";
const LEVEL = {
  danger: "error",
  warning: "warning",
  caution: "note",
  info: "note",
};
function toSarif(result) {
  const rules = new Map(),
    results = [];
  for (const f of result.findings) {
    const ruleId = `${f.engine}/${f.rule}`;
    if (!rules.has(ruleId))
      rules.set(ruleId, {
        id: ruleId,
        name: f.rule,
        shortDescription: { text: String(f.message).slice(0, 120) },
        helpUri:
          f.engine === "axe"
            ? `https://dequeuniversity.com/rules/axe/4.10/${f.rule}`
            : ANDI_HELP,
        properties: f.wcag ? { tags: f.wcag.map((w) => `WCAG ${w}`) } : {},
      });
    // Guard: f.element may be null for s/h/i module findings (iframes, hidden, structures).
    // Build region only when element.html is available; omit snippet when element is null.
    const region = f.element && f.element.html
      ? { snippet: { text: f.element.html } }
      : {};
    results.push({
      ruleId,
      level: LEVEL[f.severity] || "note",
      message: { text: f.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: f.url || (result.urls && result.urls[0]) || "page",
            },
            region,
          },
          logicalLocations: f.element && f.element.selector
            ? [{ fullyQualifiedName: f.element.selector }]
            : undefined,
        },
      ],
      properties: { engine: f.engine, module: f.module, wcag: f.wcag },
    });
  }
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "andi-cli",
            informationUri: "https://github.com/arunsanna/andi-cli",
            version: result.version || "1.0.0",
            rules: [...rules.values()],
          },
        },
        results,
      },
    ],
  };
}
module.exports = { toSarif };

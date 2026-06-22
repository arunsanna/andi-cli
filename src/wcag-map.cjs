"use strict";
const TABLE = [
  {
    re: /no accessible name|innertext, or \[title\]/,
    ruleId: "no-accessible-name",
    wcag: ["4.1.2"],
  },
  {
    re: /image .*(no alt|no accessible name)/,
    ruleId: "image-no-name",
    wcag: ["1.1.1"],
  },
  { re: /contrast/, ruleId: "low-contrast", wcag: ["1.4.3"] },
  {
    re: /table.*(header|<th>|caption)/,
    ruleId: "table-no-headers",
    wcag: ["1.3.1"],
  },
  { re: /heading/, ruleId: "heading-structure", wcag: ["1.3.1", "2.4.6"] },
  {
    re: /iframe.*title|title.*iframe/,
    ruleId: "iframe-no-title",
    wcag: ["4.1.2", "2.4.1"],
  },
  { re: /duplicate id/, ruleId: "duplicate-id", wcag: ["4.1.1"] },
];
function mapAlert(message) {
  const m = String(message || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  for (const row of TABLE)
    if (row.re.test(m)) return { ruleId: row.ruleId, wcag: row.wcag };
  return null;
}
module.exports = { mapAlert, TABLE };

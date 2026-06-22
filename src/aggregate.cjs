'use strict';
/**
 * aggregate.cjs — merge findings across modules/engines.
 *
 * Pure function: no Playwright, no I/O, no side effects.
 *
 * API:
 *   aggregate(findingArrays) → { findings, counts, worst }
 *
 *   findingArrays  — Array of Finding[] (one per module/engine run).
 *   findings       — Flat merged array, sorted by severity rank then module.
 *   counts         — { danger, warning, caution, info } tallied over merged findings.
 *   worst          — Highest severity present ('danger'|'warning'|'caution'|'info'),
 *                    or null when there are no findings.
 *
 * De-dup signature:
 *   sig(f) = `${f.module||'_'}|${f.rule}|${elementKey}`
 *   where elementKey = f.element
 *     ? (f.element.selector || f.element.html)
 *     : f.message
 *
 *   CRITICAL: f.element is null for structures/hidden/iframes findings (the
 *   alerts-list-primary amendment — s/h/i have no per-element node).  Never
 *   access f.element.selector when element may be null; fall back to f.message.
 *
 * Intra-engine de-dup:
 *   Within the same engine, exact-sig duplicates are dropped (keep first seen).
 *
 * Cross-engine collision:
 *   When an andi finding and an axe finding share the same element (same sig
 *   element key) but differ by rule, BOTH are kept.  The andi finding receives
 *   alsoFoundBy:['axe'] to signal the cross-engine agreement.  axe findings are
 *   never silently dropped.
 *
 * Finding shape (reference):
 *   { engine:'andi'|'axe', module:string|null, severity:'danger'|'warning'|'caution'|'info',
 *     rule:string, message:string, wcag:string[]|null,
 *     element:{tag,html,selector,andiIndex}|null }
 */

/** Severity rank — lower index = higher severity. */
const SEVERITY_RANK = ['danger', 'warning', 'caution', 'info'];

/**
 * Build the de-dup key for a finding.
 * Falls back to f.message when element is null (s/h/i modules).
 *
 * @param {object} f  Finding object.
 * @returns {string}
 */
function sig(f) {
  const elementKey = f.element
    ? (f.element.selector || f.element.html)
    : f.message;
  return `${f.module || '_'}|${f.rule}|${elementKey}`;
}

/**
 * Merge findings from multiple module/engine runs.
 *
 * @param {Array<Array<object>>} findingArrays  One Finding[] per module/engine run.
 * @returns {{ findings: object[], counts: object, worst: string|null }}
 */
function aggregate(findingArrays) {
  // Flatten all arrays.
  const all = [].concat(...findingArrays);

  // --- Intra-engine de-dup ---
  // Per engine, drop exact-sig duplicates (keep first seen).
  const seenByEngine = {};
  const deduped = [];
  for (const f of all) {
    const engine = f.engine || '_unknown_';
    if (!seenByEngine[engine]) seenByEngine[engine] = new Set();
    const key = sig(f);
    if (seenByEngine[engine].has(key)) continue;
    seenByEngine[engine].add(key);
    deduped.push(f);
  }

  // --- Cross-engine tagging ---
  // For each andi finding, look for axe findings that share the same element key
  // (regardless of rule). Tag the andi finding with alsoFoundBy:['axe'].
  //
  // Build a lookup: elementKey → Set of engines that reported it.
  // elementKey is the third segment of sig (after two '|') to be engine-agnostic.
  const elementEngines = {};
  for (const f of deduped) {
    const elementKey = f.element
      ? (f.element.selector || f.element.html)
      : f.message;
    if (!elementEngines[elementKey]) elementEngines[elementKey] = new Set();
    elementEngines[elementKey].add(f.engine);
  }

  const tagged = deduped.map((f) => {
    if (f.engine !== 'andi') return f;
    const elementKey = f.element
      ? (f.element.selector || f.element.html)
      : f.message;
    const otherEngines = elementEngines[elementKey];
    if (otherEngines && otherEngines.has('axe')) {
      // Shallow clone + tag; never mutate input.
      return Object.assign({}, f, { alsoFoundBy: ['axe'] });
    }
    return f;
  });

  // --- Sort: by severity rank (danger first), then by module name (alphabetical) ---
  const sorted = tagged.slice().sort((a, b) => {
    const ra = SEVERITY_RANK.indexOf(a.severity);
    const rb = SEVERITY_RANK.indexOf(b.severity);
    if (ra !== rb) return ra - rb;
    const ma = a.module || '';
    const mb = b.module || '';
    return ma < mb ? -1 : ma > mb ? 1 : 0;
  });

  // --- Counts ---
  const counts = { danger: 0, warning: 0, caution: 0, info: 0 };
  for (const f of sorted) {
    if (counts[f.severity] !== undefined) counts[f.severity]++;
  }

  // --- Worst ---
  let worst = null;
  for (const level of SEVERITY_RANK) {
    if (counts[level] > 0) {
      worst = level;
      break;
    }
  }

  return { findings: sorted, counts, worst };
}

module.exports = { aggregate };

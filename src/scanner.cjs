'use strict';
/**
 * andi-cli scanner — orchestrates multi-module ANDI scans and returns
 * structured Section 508 findings via aggregate().
 *
 * Strategy (validated by spikes/01–06 + spikes/04-hermetic-vendor.cjs):
 *   1. Launch headless Chromium.
 *   2. For each requested module: call scanModule() (fresh context, bypassCSP:true,
 *      vendor routes, inject, wait, extract).
 *   3. Aggregate per-module Finding[] arrays → { findings, counts, worst }.
 *   4. Return the merged result + metadata.
 *
 * Exported:
 *   scan(url, opts)        — primary public API
 *   waitAndiReady          — re-exported for callers that need the helper
 *   waitModuleStable       — re-exported for callers that need the helper
 *   injectAndi             — re-exported for callers that need the helper
 *   ANDI_MODULES           — module letter → canonical name registry
 */

const { injectAndi, waitAndiReady, waitModuleStable, resolvePlaywright } = require('./andi-helpers.cjs');
const { aggregate } = require('./aggregate.cjs');
const { MODULES, scanModule } = require('./modules.cjs');

/** All known ANDI module keys → canonical names (mirrors MODULES in modules.cjs). */
const ANDI_MODULES = MODULES;

/**
 * Resolve the list of module keys to run.
 *
 * @param {string|string[]|undefined} modulesOpt  'all', a single key, an array, or undefined.
 * @returns {string[]}  Ordered list of module keys.
 */
function resolveModuleKeys(modulesOpt) {
  if (!modulesOpt || modulesOpt === 'f') return ['f'];
  if (modulesOpt === 'all') return Object.keys(MODULES);
  if (Array.isArray(modulesOpt)) return modulesOpt;
  return [modulesOpt];
}

/**
 * Scan a URL with one or more ANDI modules.
 *
 * opts.modules  — 'all', a single key string (e.g. 'f'), or an array of keys.
 *                  Default: 'f' (focusable). Legacy: opts.module (single key).
 * opts.timeoutMs — per-step timeout in ms (default 30000).
 *
 * Returns:
 *   { url, scannedAt, version, findings, counts, worst, andiAlertTotal, externalAttempts }
 *
 * @param {string} url
 * @param {{
 *   modules?: string|string[],
 *   module?: string,
 *   timeoutMs?: number,
 *   headless?: boolean,
 * }} [opts]
 * @returns {Promise<object>}
 */
async function scan(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const { chromium } = resolvePlaywright();

  // Support legacy opts.module (single key) from v0.1 CLI.
  const modulesOpt = opts.modules ?? opts.module ?? 'f';
  const moduleKeys = resolveModuleKeys(modulesOpt);

  const browser = await chromium.launch({ headless: opts.headless !== false });
  const scannedAt = new Date().toISOString();
  try {
    const allFindingArrays = [];
    const allExternalAttempts = [];

    for (const key of moduleKeys) {
      const { findings, externalAttempts } = await scanModule(browser, url, key, { timeoutMs });
      allFindingArrays.push(findings);
      if (externalAttempts.length) allExternalAttempts.push(...externalAttempts);
    }

    const { findings, counts, worst } = aggregate(allFindingArrays);

    return {
      url,
      scannedAt,
      version: null,       // informational; populated in future by ANDI version probe
      findings,
      counts,
      worst,
      andiAlertTotal: null, // informational; populated in future by ANDI internal read
      externalAttempts: allExternalAttempts,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scan, waitAndiReady, waitModuleStable, injectAndi, ANDI_MODULES };

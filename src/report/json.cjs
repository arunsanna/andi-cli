'use strict';
/**
 * src/report/json.cjs — machine-readable JSON scan report.
 *
 * Pure function: toJson(result, scannedAt?) → object (caller serializes).
 * Does NOT call Date.now() internally — scannedAt is injected by the caller
 * (or omitted) to preserve determinism.
 */

const PKG_VERSION = require('../../package.json').version;

/**
 * Produce the canonical JSON report object.
 *
 * @param {object} result    Return value of scan().
 * @param {string} [scannedAt]  ISO timestamp; defaults to result.scannedAt.
 * @returns {object}  { tool, version, andiVersion, scannedAt, urls, findings, counts, worst, andiAlertTotal }
 *   version     — andi-cli npm package version (semver).
 *   andiVersion — ANDI release version read from window.andiVersionNumber (e.g. "29.2.2").
 */
function toJson(result, scannedAt) {
  return {
    tool: 'andi-cli',
    version: PKG_VERSION,
    andiVersion: result.andiVersion ?? null,
    scannedAt: scannedAt ?? result.scannedAt ?? null,
    directory: result.directory ?? null,
    files: result.files ?? null,
    urls: Array.isArray(result.urls) ? result.urls : [result.url],
    findings: result.findings || [],
    counts: result.counts || { danger: 0, warning: 0, caution: 0, info: 0 },
    worst: result.worst ?? null,
    andiAlertTotal: result.andiAlertTotal ?? null,
  };
}

module.exports = { toJson };

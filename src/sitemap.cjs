'use strict';
/**
 * sitemap.cjs — multi-URL scanning helpers for andi-cli.
 *
 * Exported:
 *   parseSitemap(xmlString) → string[]
 *     Extract <loc> URLs from a sitemap.xml string.
 *     Uses fast-xml-parser when available; falls back to a robust regex.
 *
 *   readUrlsFile(text) → string[]
 *     Parse a newline-separated URL list: trim lines, skip blanks and # comments.
 *
 *   scanUrls(urls, opts) → Promise<result>
 *     Scan each URL via scan() from ./scanner, tag every finding with finding.url,
 *     aggregate all findings across pages into one result.
 *     opts.concurrency  default 1 (sequential, deterministic ordering)
 *     On per-URL scan error: record it, don't abort; result.hasErrors = true.
 */

const { scan } = require('./scanner.cjs');
const { aggregate } = require('./aggregate.cjs');

// ---------------------------------------------------------------------------
// parseSitemap
// ---------------------------------------------------------------------------

/**
 * Extract <loc> URLs from a sitemap.xml string.
 *
 * Tries fast-xml-parser first (already a devDep); falls back to regex.
 *
 * @param {string} xmlString
 * @returns {string[]}
 */
function parseSitemap(xmlString) {
  // Try fast-xml-parser (devDep, always available).
  try {
    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xmlString);
    // Shape: { urlset: { url: [{loc: '...'}, ...] | {loc: '...'} } }
    const urlset = parsed && parsed.urlset;
    if (urlset) {
      const urlEntry = urlset.url;
      if (!urlEntry) return [];
      // Single <url> comes back as an object, multiple as an array.
      const entries = Array.isArray(urlEntry) ? urlEntry : [urlEntry];
      return entries
        .map((e) => (e && e.loc != null ? String(e.loc).trim() : null))
        .filter(Boolean);
    }
  } catch (_) {
    // fall through to regex
  }

  // Regex fallback: match every <loc>…</loc> pair.
  const matches = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xmlString)) !== null) {
    const url = m[1].trim();
    if (url) matches.push(url);
  }
  return matches;
}

// ---------------------------------------------------------------------------
// readUrlsFile
// ---------------------------------------------------------------------------

/**
 * Parse a newline-separated URL list.
 * Trims each line, skips blank lines and lines starting with #.
 *
 * @param {string} text
 * @returns {string[]}
 */
function readUrlsFile(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

// ---------------------------------------------------------------------------
// scanUrls
// ---------------------------------------------------------------------------

/**
 * Scan a list of URLs, tag each finding with finding.url = page URL,
 * and aggregate all findings into one combined result.
 *
 * Per-URL scan errors are recorded in result.errors; the run continues.
 * result.hasErrors = true when any URL failed to scan.
 *
 * result.externalAttempts is a flat array of objects {page, attempt} where
 * page is the source URL and attempt is the blocked external URL string.
 * This supports --strict-offline enforcement across multi-URL scans.
 *
 * @param {string[]} urls
 * @param {{
 *   concurrency?: number,
 *   modules?: string|string[],
 *   module?: string,
 *   timeoutMs?: number,
 *   headless?: boolean,
 *   strictOffline?: boolean,
 * }} [opts]
 * @returns {Promise<{
 *   urls: string[],
 *   findings: object[],
 *   counts: object,
 *   worst: string|null,
 *   errors: Array<{url: string, error: string}>,
 *   hasErrors: boolean,
 *   externalAttempts: Array<{page: string, attempt: string}>,
 * }>}
 */
async function scanUrls(urls, opts = {}) {
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const scanOpts = {
    modules: opts.modules ?? opts.module,
    timeoutMs: opts.timeoutMs,
    headless: opts.headless,
    withAxe: opts.withAxe,
    strictOffline: opts.strictOffline,
  };

  const errors = [];
  // allFindingArrays collects tagged Finding[] per successful page scan.
  const allFindingArrays = [];
  // allExternalAttempts aggregates {page, attempt} across all pages.
  const allExternalAttempts = [];

  if (concurrency === 1) {
    // Sequential — deterministic ordering, simplest implementation.
    for (const url of urls) {
      let pageResult;
      try {
        pageResult = await scan(url, scanOpts);
      } catch (e) {
        errors.push({ url, error: e.message || String(e) });
        continue;
      }
      // Aggregate external attempts from this page (tagged with source page URL).
      if (Array.isArray(pageResult.externalAttempts)) {
        for (const attempt of pageResult.externalAttempts) {
          allExternalAttempts.push({ page: url, attempt });
        }
      }
      // Tag every finding with the page URL.
      const tagged = pageResult.findings.map((f) => Object.assign({}, f, { url }));
      allFindingArrays.push(tagged);
    }
  } else {
    // Bounded concurrency pool.
    const inFlight = new Set();
    const results = new Array(urls.length);
    let nextIndex = 0;

    await new Promise((resolve) => {
      function dispatch() {
        while (inFlight.size < concurrency && nextIndex < urls.length) {
          const idx = nextIndex++;
          const url = urls[idx];
          const p = scan(url, scanOpts)
            .then((pageResult) => {
              results[idx] = {
                ok: true,
                tagged: pageResult.findings.map((f) => Object.assign({}, f, { url })),
                externalAttempts: Array.isArray(pageResult.externalAttempts)
                  ? pageResult.externalAttempts.map((a) => ({ page: url, attempt: a }))
                  : [],
              };
            })
            .catch((e) => {
              results[idx] = { ok: false, url, error: e.message || String(e) };
            })
            .finally(() => {
              inFlight.delete(p);
              dispatch();
              if (inFlight.size === 0 && nextIndex >= urls.length) resolve();
            });
          inFlight.add(p);
        }
        // Edge case: queue was empty from the start.
        if (inFlight.size === 0 && nextIndex >= urls.length) resolve();
      }
      dispatch();
    });

    for (const r of results) {
      if (!r) continue;
      if (r.ok) {
        allFindingArrays.push(r.tagged);
        if (r.externalAttempts) allExternalAttempts.push(...r.externalAttempts);
      } else {
        errors.push({ url: r.url, error: r.error });
      }
    }
  }

  // Aggregate all per-page tagged findings.
  const { findings, counts, worst } = aggregate(allFindingArrays);

  return {
    urls,
    findings,
    counts,
    worst,
    errors,
    hasErrors: errors.length > 0,
    externalAttempts: allExternalAttempts,
  };
}

module.exports = { parseSitemap, readUrlsFile, scanUrls };

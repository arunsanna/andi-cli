'use strict';
/**
 * Directory scanning support.
 *
 * The scanner still needs a browser-rendered DOM, so directory mode serves a
 * local static tree over 127.0.0.1 and scans every discovered HTML page.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { scanUrls } = require('./sitemap.cjs');

const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const SKIP_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
]);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function assertDirectory(root) {
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) {
    throw new Error(`--dir must point to a directory: ${root}`);
  }
}

function discoverHtmlFiles(root, opts = {}) {
  const resolvedRoot = path.resolve(root);
  assertDirectory(resolvedRoot);

  const skipDirs = new Set([...(opts.skipDirs || SKIP_DIRS)]);
  const files = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && HTML_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  walk(resolvedRoot);
  return files;
}

function routeForFile(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return '/' + rel.split(path.sep).map(encodeURIComponent).join('/');
}

function fileForRequest(root, requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (_) {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, '');
  let candidate = path.resolve(root, relativePath);
  const resolvedRoot = path.resolve(root);

  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) {
    return null;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    candidate = path.join(candidate, 'index.html');
  }

  return candidate;
}

function contentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function startStaticServer(root) {
  const resolvedRoot = path.resolve(root);
  assertDirectory(resolvedRoot);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const filePath = fileForRequest(resolvedRoot, req.url || '/');
      if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, body) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(body);
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const origin = `http://127.0.0.1:${port}`;
      resolve({
        origin,
        urlForFile: (file) => origin + routeForFile(resolvedRoot, file),
        close: () => new Promise((done, fail) => {
          server.close((err) => (err ? fail(err) : done()));
        }),
      });
    });
  });
}

async function scanDirectory(dir, opts = {}) {
  const root = path.resolve(dir);
  const htmlFiles = discoverHtmlFiles(root);
  if (htmlFiles.length === 0) {
    throw new Error(
      `No .html or .htm files found under ${root}. Build the app first, then scan the output directory.`
    );
  }

  const staticServer = await startStaticServer(root);
  try {
    const urls = htmlFiles.map((file) => staticServer.urlForFile(file));
    const result = await scanUrls(urls, {
      concurrency: opts.concurrency,
      modules: opts.modules ?? opts.module,
      timeoutMs: opts.timeoutMs,
      headless: opts.headless,
      strictOffline: opts.strictOffline,
      withAxe: opts.withAxe,
      allowedOrigins: [staticServer.origin],
    });

    return {
      ...result,
      url: `directory:${root}`,
      directory: root,
      staticOrigin: staticServer.origin,
      files: htmlFiles.map((file) => path.relative(root, file)),
    };
  } finally {
    await staticServer.close();
  }
}

module.exports = {
  discoverHtmlFiles,
  routeForFile,
  startStaticServer,
  scanDirectory,
};

# andi-cli — headless SSA ANDI Section 508 scanner
#
# Base image bundles Chromium 1187 (matches Playwright 1.55.0 pin).
# No `npx playwright install` needed — browser is already present.
FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

# Install production deps only; devDependencies (ajv, fast-xml-parser,
# js-yaml, node-html-parser) are used only in tests or have in-source
# fallbacks (sitemap.cjs regex fallback when fast-xml-parser is absent).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the andi/ vendored tree and the CLI source.
COPY andi/ ./andi/
COPY src/ ./src/

ENTRYPOINT ["node", "src/cli.cjs"]

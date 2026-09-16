# andi-cli — headless SSA ANDI Section 508 scanner
#
# Base image bundles Chromium 1193 (matches Playwright 1.55.1 pin).
# No `npx playwright install` needed — browser is already present.
FROM mcr.microsoft.com/playwright:v1.55.1-noble

WORKDIR /app

# Install production deps only; devDependencies (ajv, fast-xml-parser,
# js-yaml, node-html-parser) are used only in tests or have in-source
# fallbacks (sitemap.cjs regex fallback when fast-xml-parser is absent).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the andi/ vendored tree and the CLI source.
COPY andi/ ./andi/
COPY src/ ./src/

# Keep ENTRYPOINT as the CLI so `docker run IMAGE --url ...` works.
# Also put andi-scan on PATH for GitLab/Jenkins jobs that clear the entrypoint.
RUN printf '#!/bin/sh\nexec node /app/src/cli.cjs "$@"\n' > /usr/local/bin/andi-scan \
  && chmod +x /usr/local/bin/andi-scan

ENTRYPOINT ["node", "src/cli.cjs"]

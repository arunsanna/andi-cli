# Troubleshooting

## `andi-scan` is not found

Use the package launcher directly:

macOS:

```bash
./bin/andi-scan --help
```

Windows PowerShell:

```powershell
.\bin\andi-scan.ps1 --help
```

Windows Command Prompt:

```bat
bin\andi-scan.cmd --help
```

If direct launch works, add the package `bin` directory to PATH.

## Chromium headless shell cannot launch

The portable package installs Playwright Chromium headless shell inside:

```text
node_modules/playwright-core/.local-browsers
```

The launchers set:

```text
PLAYWRIGHT_BROWSERS_PATH=0
```

If Chromium still cannot launch:

- confirm the package was fully extracted before running
- avoid running from a partially synced cloud folder
- check whether security tooling quarantined or removed browser files
- on Windows, retry from a short path such as `C:\tools\andi-cli`

## Browser download fails while building a package

The package build runs:

```bash
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --only-shell chromium
```

Behind a proxy, configure the standard environment variables before packaging:

```bash
HTTPS_PROXY=http://proxy.example.com:8080
HTTP_PROXY=http://proxy.example.com:8080
```

If your organization mirrors Playwright browser downloads, set:

```bash
PLAYWRIGHT_DOWNLOAD_HOST=https://artifacts.example.com/playwright
```

## Exit code `1`

The scan completed and found at least one issue at or above `--fail-on`.

Use a report:

```bash
andi-scan --url https://staging.example.com --module all --fail-on danger --html andi-report.html
```

## Exit code `2`

The scan did not complete successfully. Common causes:

- URL is missing or malformed
- the target is unreachable
- a local file URL points to a missing file
- `--strict-offline` saw an external request
- Chromium could not start

## PowerShell blocks the launcher

Use the `.cmd` launcher:

```bat
bin\andi-scan.cmd --help
```

or allow local scripts for the current user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## macOS blocks the launcher

The first portable packages are unsigned. If macOS Gatekeeper blocks execution,
remove quarantine from the extracted package directory:

```bash
xattr -dr com.apple.quarantine .
```

## What a clean package proof includes

The desktop package workflow records a smoke log for each platform. A passing
log means:

- `andi-scan --help` exited `0`
- a clean fixture exited `0`
- a violation fixture exited `1`
- JSON, SARIF, and HTML reports were written and parsed

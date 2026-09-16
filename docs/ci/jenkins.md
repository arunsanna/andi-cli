# Jenkins — ANDI 508 Scan

Add an `Accessibility` stage to a Jenkins declarative pipeline to gate builds
on ANDI findings. A clean scan is **not** a Section 508 certification.

> **Not published yet.** There is no `ghcr.io/arunsanna/andi-cli` image.
> Build the `Dockerfile` in this repo. The image entrypoint **is** the CLI —
> pass flags only (`docker run IMAGE --url ...`). Do **not** pass `andi-scan`
> as a Docker argument.

## Pattern 1 — `docker run` (recommended until the image is published)

Build the image from this repo, then pass flags only. Reports land in the
workspace via the bind mount.

```groovy
pipeline {
  agent any

  environment {
    TARGET_URL = 'https://staging.example.com'
  }

  stages {
    stage('Build ANDI image') {
      steps {
        sh 'docker build -t andi-cli-local:${BUILD_NUMBER} .'
      }
    }
    stage('Accessibility') {
      steps {
        sh '''
          docker run --rm \
            -v "$WORKSPACE:/workspace" \
            andi-cli-local:${BUILD_NUMBER} \
            --url "$TARGET_URL" \
            --module all \
            --fail-on danger \
            --sarif /workspace/andi.sarif \
            --html /workspace/andi-report.html \
            --junit /workspace/report.xml
        '''
      }
      post {
        always {
          junit 'report.xml'
          archiveArtifacts artifacts: 'andi.sarif, andi-report.html',
                           allowEmptyArchive: true
        }
      }
    }
  }
}
```

## Pattern 2 — Docker agent

Clear the image entrypoint, then call Node (`WORKDIR` is `/app`). Jenkins
marks the build failed when the CLI exits non-zero.

```groovy
pipeline {
  agent none

  environment {
    TARGET_URL = 'https://staging.example.com'
  }

  stages {
    stage('Accessibility') {
      agent {
        docker {
          image 'andi-cli-local'
          args '--entrypoint='
        }
      }
      steps {
        sh '''
          node /app/src/cli.cjs \
            --url "$TARGET_URL" \
            --module all \
            --fail-on danger \
            --sarif andi.sarif \
            --html andi-report.html \
            --junit report.xml
        '''
      }
      post {
        always {
          junit 'report.xml'
          archiveArtifacts artifacts: 'andi.sarif, andi-report.html',
                           allowEmptyArchive: true
        }
      }
    }
  }
}
```

## Full pipeline with multiple URLs

```groovy
pipeline {
  agent any

  environment {
    TARGET_URL = 'https://staging.example.com'
  }

  stages {
    stage('Build ANDI image') {
      steps {
        sh 'docker build -t andi-cli-local:${BUILD_NUMBER} .'
      }
    }

    stage('Accessibility') {
      steps {
        writeFile file: 'urls.txt', text: '''
https://staging.example.com/
https://staging.example.com/login
https://staging.example.com/dashboard
'''
        sh '''
          docker run --rm \
            -v "$WORKSPACE:/workspace" \
            --workdir /workspace \
            andi-cli-local:${BUILD_NUMBER} \
              --urls /workspace/urls.txt \
              --module all \
              --fail-on danger \
              --sarif /workspace/andi.sarif
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'andi.sarif', allowEmptyArchive: true
        }
        failure {
          echo 'Accessibility gate failed — review andi.sarif for findings.'
        }
      }
    }
  }
}
```

## Building the image from source

To pin a specific commit instead of using the pre-built image, build it in a prior stage:

```groovy
stage('Build ANDI image') {
  steps {
    sh 'docker build -t andi-cli-local:${BUILD_NUMBER} .'
  }
}

stage('Accessibility') {
  steps {
    sh '''
      docker run --rm \
        -e TARGET_URL \
        -v "$WORKSPACE:/workspace" \
        --workdir /workspace \
        andi-cli-local:${BUILD_NUMBER} \
          --url "$TARGET_URL" \
          --module all \
          --fail-on danger \
          --sarif /workspace/andi.sarif
    '''
  }
  post {
    always {
      archiveArtifacts artifacts: 'andi.sarif', allowEmptyArchive: true
    }
  }
}
```

## All CLI flags

| Flag               | Default  | Description                                                                         |
| ------------------ | -------- | ----------------------------------------------------------------------------------- |
| `--url <url>`      | _(none)_ | Single URL to scan (`http://`, `https://`, or `file://`).                           |
| `--urls <file>`    | _(none)_ | Newline-separated file of URLs (`#` = comment line).                                |
| `--sitemap <url>`  | _(none)_ | Sitemap XML to fetch/read; scan all `<loc>` entries.                                |
| `--module <key>`   | `f`      | ANDI module(s): `f`=focusable, `g`=graphics, `l`=links, `t`=tables,                 |
|                    |          | `s`=structures, `c`=contrast, `h`=hidden, `i`=iframes, `all`=run all.               |
| `--fail-on <lvl>`  | `danger` | Exit 1 when worst finding severity ≥ level: `danger`\|`warning`\|`caution`\|`none`. |
| `--sarif <file>`   | _(none)_ | Write SARIF 2.1.0 results to `<file>`.                                              |
| `--html <file>`    | _(none)_ | Write self-contained HTML report to `<file>`.                                       |
| `--junit <file>`   | _(none)_ | Write JUnit XML results to `<file>` (consumed by `junit 'report.xml'` post step).   |
| `--out <file>`     | _(none)_ | Write full JSON results to `<file>`.                                                |
| `--strict-offline` | off      | Exit 2 if any external network requests are detected during the scan.               |

## Exit codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | No findings at or above `--fail-on` threshold (or `--fail-on none`). |
| `1`  | One or more findings at or above threshold — build marked FAILED.    |
| `2`  | Scan error, or `--strict-offline` detected external network calls.   |

Jenkins marks a `steps { sh '...' }` block as failed when the command exits non-zero.
Exit 1 (findings at or above threshold) and exit 2 (scan error) therefore both fail the
stage and the overall build. Use `post { always { archiveArtifacts ... } }` to preserve
the SARIF and HTML reports even when the gate fires, so findings are reviewable in the
build artifacts.

## Notes

- `--fail-on danger` (the default) blocks only on `danger`-level findings. Change to
  `--fail-on warning` for a stricter gate.
- The archived `andi.sarif` file can be imported into security dashboards or SAST tools
  that accept SARIF 2.1.0 input.
- To treat accessibility failures as non-blocking warnings, wrap the `sh` step in
  `catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE')` — findings will mark the
  stage unstable without failing the build.
- Automated checks cover a subset of Section 508; ANDI surfaces items for human
  Trusted-Tester judgment.

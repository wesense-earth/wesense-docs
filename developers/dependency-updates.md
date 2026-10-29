# Dependency Updates & Security Alerts

WeSense keeps its dependencies current with as little manual work as possible. GitHub finds vulnerable or outdated packages, opens a pull request to fix them, tests it, and — for safe changes — merges it. Everything else waits for a person.

This page describes how that works, what you will see, and what (little) you need to do.

## The short version

| Kind of update | What happens | Your job |
|---|---|---|
| **Security fix** (a known vulnerability) | Dependabot opens a PR. If the checks pass, it merges itself. | Read the notification. |
| **Patch bump** (`1.2.3` → `1.2.4`) | Same as above. | Read the notification. |
| **Minor / major bump** (`1.2` → `1.3`, `1.x` → `2.x`) | Dependabot opens a PR. It does **not** merge. | Skim the changelog in the PR, merge if happy. |
| **No fix exists yet, or the fix is blocked** | The alert stays open on the Security tab. Nothing is ignored or dismissed. | Decide: wait, pin, override, or replace the package. |

**Security comes first.** If a security fix cannot be applied (no fixed version exists, or the fix needs a package that conflicts with something else), that is a decision for a person. Nobody and nothing may close the PR, dismiss the alert, or tell Dependabot to ignore it to make the noise go away. The alert stays open until it is really fixed.

All work happens on `main`. There is no `dev` branch: a merged fix goes straight into the next `:latest` image.

## How it fits together

```
 GitHub finds a vulnerable / outdated package
              │
              ▼
 Dependabot opens a PR  ──►  CI runs: build (all platforms) + smoke test
              │
              ▼
 Security fix or patch bump?
        │yes                         │no (minor / major)
        ▼                            ▼
 Workflow waits for the checks,    PR waits for you
 then merges it
        │
        ▼
 Build started on main  ──►  new image published to ghcr.io  ──►  you get a notification
```

### 1. Finding problems

Each GitHub repository in the `wesense-earth` organisation has these switched on:

- **Dependabot alerts** — flags packages with known vulnerabilities (CVEs).
- **Dependabot security updates** — opens a PR to move to the first fixed version.
- **Dependabot version updates** — configured per repo in `.github/dependabot.yml`. Checks weekly (Mondays) for newer versions of Python, npm, Cargo, Docker base images, docker-compose images and GitHub Actions.
- **Secret scanning with push protection** — blocks pushes that contain credentials.
- **CodeQL** — scans the code itself for common security mistakes.

Routine (non-security) updates are **grouped**: all the minor and patch bumps for a repo in one week arrive as a single PR, so a repo produces at most a handful of PRs per week. Security fixes are never grouped; each gets its own PR straight away.

### 2. Testing

A green build alone does not prove a service still works, so every service has a **smoke test** (the `smoke` check in `docker-build.yml`). It builds the real image and then:

| Service type | Smoke test |
|---|---|
| Python (ingesters, storage broker, live transport, Zenoh API) | Imports every third-party module the code uses, and runs `pip check`. Catches a bump that removes, renames or breaks a package. |
| Node.js (Respiro, OrbitDB, deployment classifier) | Imports every runtime dependency in `package.json`. |
| Rust (archive replicator) | Checks the binary is present and all its shared libraries resolve. The compile step in the build covers API breakage. |
| Website | Builds the image, starts it and checks it serves the page. The live site is **not** deployed from this image: it is built with `npm run build` by `deploy-hostinger.yml` and published to the `deploy` branch for Hostinger. The image build is only an extra check. |
| `wesense-ingester-core` | Runs its pytest suite (the `test` check). |

The per-service smoke tests do **not** start the services against live MQTT, ClickHouse or Zenoh. They catch broken dependencies, not broken behaviour. That is why only low-risk updates are merged automatically.

#### Full-stack test

The `wesense` deployment repository has its own `Stack smoke test`. It checks that the compose file is valid for every deployment profile, then starts the whole `guardian` stack from the published `:latest` images and requires every container to become healthy and stay up for a minute without restarting. It also checks that the map answers. It runs on every pull request to `wesense` and **every day**, so a service update that breaks the combination shows up as a red run within a day, even though each service passed on its own.

### 3. Merging

Branch protection on `main` requires the checks to pass:

- `smoke`
- `build (linux/amd64, ubuntu-latest)`
- `build (linux/arm64, ubuntu-24.04-arm)`
- `build (linux/arm/v7, ubuntu-24.04-arm)` — only for the Node.js repos and the website
- `test` — for `wesense-ingester-core`
- `stack-up` and the `compose-config (...)` checks — for the `wesense` deployment repository

The `dependabot-automerge.yml` workflow runs on Dependabot PRs. For a **security fix** or a **patch bump** it waits for the required checks, merges the PR, and then starts the build (see below). If a check fails, nothing is merged and the PR stays open for you. A new push to the PR, such as a Dependabot rebase, cancels the old wait and starts again.

Repository admins can still push directly to `main` (for example to fix a broken build); the checks are not enforced against admins.

### 4. Publishing

Merging to `main` triggers the normal build, which publishes `ghcr.io/wesense-earth/<repo>:latest`.

::: warning Why the workflow starts the build itself
GitHub deliberately does not start workflows for events caused by the built-in `GITHUB_TOKEN`. A PR merged by the auto-merge workflow therefore does not trigger the usual push build. After merging, the workflow starts the build explicitly (`gh workflow run`), which is the one trigger the built-in token is allowed to use. Do not replace this with GitHub's own "auto-merge" button: it merges, but nothing gets published.
:::

In addition, **every service is rebuilt once a week** (Sunday, 14:00 UTC) even if nothing changed. This matters because:

- Several Python services declare dependencies as `>=` ranges, which Dependabot cannot bump. A rebuild picks up newer releases of those packages.
- A rebuild picks up fixed versions of the base image (`python:3.11-slim`, `node`, `debian`, …).

### 5. Reaching a station

Stations do not build from these repositories. They run the images through the `wesense` docker-compose deployment, so a fix reaches a running station only when it **pulls the new image** (`docker compose pull && docker compose up -d`, or an automatic updater such as Watchtower). The default `IMAGE_TAG=latest` follows these builds; stations pinned to a release tag (`IMAGE_TAG=1.0.0-alpha.1`) are deliberately not affected.

Each service is tested on its own, and the daily full-stack test (above) checks that the published images still work *together*. Run that test (or look at its latest result under the `wesense` repository's Actions tab) before pulling a new set of images onto a station.

## Node.js versions

Dependabot is told to leave **Node.js major versions** alone in the Dockerfiles; changing them is a deliberate decision. WeSense is on **Node 22**, not 24, because Node 24 images are not published for 32-bit ARM (`linux/arm/v7`, older Raspberry Pis), which WeSense supports. Node 20 reached end of life on 30 April 2026 and is no longer used anywhere, including the website's GitHub workflow. Revisit this when Node 22 approaches its end of life (30 April 2027) or when 32-bit ARM is dropped.

## What you will see

- **Email** from GitHub for each new Dependabot alert and PR. Check **github.com/settings/notifications** that *Dependabot alerts* has *Email* ticked.
- **One page for everything:** `github.com/organizations/wesense-earth/security` shows open alerts across every repository.
- **Per repo:** the *Security* tab (alerts, code scanning, secret scanning) and the *Pull requests* tab (Dependabot PRs, labelled `dependencies`).

## Routine

1. When a notification arrives, open the PR.
2. Security or patch bump with green checks: nothing to do — it will merge itself.
3. Minor or major bump: read the changelog link in the PR description, then merge. Do them one at a time if several arrive, so a problem is easy to trace.
4. If a PR fails its checks, the failure is the information: open the failing job, or ask Claude Code to look at it.

## Repositories not covered

| Repository | Why |
|---|---|
| `wesense-ha-plugin` | Dependabot has no ecosystem for a Home Assistant integration manifest. |
| `wesense-clickhouse-live`, `wesense-media` | No dependencies. |
| `orbitdb` (fork) | Alerts only. Version-update PRs on an upstream fork would be noise; the fork is pinned in `wesense-orbitdb/package.json`. |
| Repositories on the private Gitea server | GitHub cannot watch them. |
| `wesense` | Protected by the full-stack test, but nothing auto-merges: its updates are compose image versions, which a person reviews. |
| `wesense-sensor-firmware`, `wesense-docs` | Dependabot PRs open, but there is no branch protection or required check, so nothing auto-merges. |

## Adding a new repository

1. Copy `.github/dependabot.yml` from a similar repo and adjust the ecosystems.
2. In **Settings → Advanced Security**, enable Dependabot alerts, security updates, secret scanning, push protection and CodeQL (or use the org-wide defaults).
3. Add a `smoke` job to its `docker-build.yml` (copy one from a similar repo) and the `.github/smoke/` script it calls.
4. Add `dependabot-automerge.yml`, listing the workflow files it should start after a merge (normally just `docker-build.yml`). Make sure each of those has a `workflow_dispatch` trigger.
5. Under **Settings → Branches**, protect `main` and require the checks listed above.

Step 5 matters: without a required check, GitHub merges an auto-merge PR immediately instead of waiting for CI.

## Limitations worth knowing

- The smoke tests prove packages import and the image builds, not that the service behaves correctly. The daily full-stack test starts every service together, but it does not feed real sensor data through. Behavioural tests would make automatic merging safer.
- A grouped weekly PR can contain a minor bump that is treated like any minor bump: it waits for you, even if most of its contents are patches.
- If no fixed version of a vulnerable package exists, or the fix needs a major upgrade that conflicts with something else, Dependabot cannot open a PR and the alert stays open.

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

#### Advisories Dependabot cannot see

Dependabot only knows the advisories in GitHub's reviewed advisory database. Some projects publish security advisories only in their own repository, and those never reach that database. `js-libp2p` (the peer-to-peer library under OrbitDB) did exactly this: several advisories were published there while `npm audit` and Dependabot both reported nothing, and the installed versions were affected. An independent database (OSV.dev) did not have them either, so a different scanner would not have helped.

`wesense-orbitdb` therefore has its own check, `.github/workflows/advisory-check.yml`. Every day, and whenever the lockfile changes, it reads the advisories published by `libp2p/js-libp2p`, `ipfs/helia` and `orbitdb/orbitdb` and compares their vulnerable version ranges with `package-lock.json`. If anything installed is affected it opens one issue (and fails the run); the issue closes itself once nothing is affected. It needs no maintenance unless GitHub changes its API; if it breaks, the run shows as failed. Other repositories do not have this gap today. If a dependency elsewhere starts publishing advisories only upstream, copy the script (`.github/scripts/check-advisories.mjs`) and list that project's repository.

Routine (non-security) updates are **grouped**: all the minor and patch bumps for a repo in one week arrive as a single PR, so a repo produces at most a handful of PRs per week. Security fixes are never grouped; each gets its own PR straight away.

### 2. Testing

A green build alone does not prove a service still works, so every service that ships as a Docker image has a **smoke test** (the `smoke` check in `docker-build.yml`). It builds the real image and then:

| Service type | Smoke test |
|---|---|
| Python (ingesters, storage broker, live transport, Zenoh API) | Imports every third-party module the code uses, and runs `pip check`. Catches a bump that removes, renames or breaks a package. |
| Node.js (Respiro, OrbitDB, deployment classifier) | Imports every runtime dependency in `package.json`. OrbitDB also runs its route tests (`npm test`) and the replication test below. |
| Rust (archive replicator) | Checks the binary is present and all its shared libraries resolve. The compile step in the build covers API breakage. |
| Website | The `build` check runs `npm ci`, `npm run lint` and `npm run build`, the same steps `deploy-hostinger.yml` uses to publish the site to the `deploy` branch for Hostinger. The website has no Docker image any more. |
| `wesense-ingester-core` | Runs its pytest suite (the `test` check). |
| `wesense-sensor-firmware` | The `test` check runs the protobuf round-trip tests with the protobuf version from `requirements.txt`, and regenerates the nanopb C files from the `.proto` and fails if they differ from the committed ones. The Python packages in `requirements.txt` are build tooling only; nothing from them is compiled into the firmware. |

#### OrbitDB replication test

A rolling upgrade means stations run different versions for a while, and OrbitDB can break that without any import failing: a version can start cleanly and still stop exchanging data with the stations already running. `wesense-orbitdb` therefore runs `scripts/replication-test.sh` in CI (the `replication` check). It starts two real containers on a private network, writes a record on each and requires it to appear on the other. It runs three pairings: new with new, the currently published image with the new build, and the new build with the published image. It runs on every pull request, including Dependabot's, and every day, and `replication` is a required check. Run it by hand with `scripts/replication-test.sh <image-A> [image-B]`.

The per-service smoke tests do **not** start the services against live MQTT, ClickHouse or Zenoh. They catch broken dependencies, not broken behaviour. That is why only low-risk updates are merged automatically.

#### Full-stack test

The `wesense` deployment repository has its own `Stack smoke test`. It checks that the compose file is valid for every deployment profile, then starts the whole `guardian` stack from the published `:latest` images and requires every container to become healthy and stay up for a minute without restarting. It also checks that the map answers. It runs on every pull request to `wesense` and **every day**, so a service update that breaks the combination shows up as a red run within a day, even though each service passed on its own.

### 3. Merging

Branch protection on `main` requires the checks to pass:

- `smoke`
- `build (linux/amd64, ubuntu-latest)`
- `build (linux/arm64, ubuntu-24.04-arm)`
- `build (linux/arm/v7, ubuntu-24.04-arm)` — only for the Node.js repos
- `replication` — for `wesense-orbitdb`
- `test` — for `wesense-ingester-core` and `wesense-sensor-firmware`
- `build` — for `wesense-website` and `wesense-docs`, which have no Docker image (it runs `npm ci`, lint where there is one, and the site build)
- `stack-up` and the `compose-config (...)` checks — for the `wesense` deployment repository

The `dependabot-automerge.yml` workflow runs on Dependabot PRs. For a **security fix** or a **patch bump** it waits for the required checks, merges the PR, and then starts the build (see below; for the website, the Hostinger deploy). If a check fails, nothing is merged and the PR stays open for you. A new push to the PR, such as a Dependabot rebase, cancels the old wait and starts again.

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

Stations upgrade at different times, so two versions of a service must work together. For OrbitDB that is what the replication test checks. Each service is tested on its own, and the daily full-stack test (above) checks that the published images still work *together*. Run that test (or look at its latest result under the `wesense` repository's Actions tab) before pulling a new set of images onto a station.

## The OrbitDB fork

`wesense-orbitdb` depends on `wesense-earth/orbitdb`, a fork of upstream `orbitdb/orbitdb`. The branch `wesense-main-v4` is upstream's latest release plus two features upstream does not have yet: time-to-live for oplog entries and tolerance for entries that cannot be fetched. The fork is pinned by commit in `wesense-orbitdb/package-lock.json`.

Upstream security and bug fixes reach WeSense through `wesense-upstream-sync.yml` in the fork. Every Monday it merges the newest stable upstream release into a `sync/<tag>` branch, runs the fork's test suite and opens a pull request into `wesense-main-v4`. If the merge conflicts with our patches, or the tests fail, it opens an issue instead. It never pushes to the integration branch itself. For safety it runs in two jobs: the one that runs upstream code has a read-only token and no stored credentials, and the one with write access runs none of that code.

The fork's dev and test tooling (mocha, the linter and their dependencies) is not shipped, but our CI does run it, so it is kept secure like everything else: the lockfile is updated with `npm audit fix` inside upstream's version ranges, plus two overrides in the fork's `package.json` (`@libp2p/webrtc`, `serialize-javascript`) and `@libp2p/gossipsub` 17 for the tests. Upstream's lockfile knows nothing about this, so after every merge the sync job redoes the lockfile update, and if only `package-lock.json` conflicts it takes upstream's and redoes it. Any other conflict still opens an issue. Browser testing (playwright and webpack) is removed from this branch: WeSense runs OrbitDB only in Node, and the browser tests are not run by the sync job.

Merging that PR is not the end: point `wesense-orbitdb` at the new commit (`npm update @orbitdb/core`), and let its CI, including the replication test, decide. Upstreaming our two features would let the fork shrink to nothing; it is tracked in `wesense-orbitdb` issue #41.

## Package overrides

A package override forces a dependency to a version other than the one its parent asks for. We use one only when a security fix exists for a package that its parent has not yet moved to, and we record it here so it gets removed.

| Repository | Override | Why | Remove when |
|---|---|---|---|
| `wesense-docs` | `vite` `^6.4.5` | VitePress 1.6.x pins Vite 5, which has no patched release for the Vite and esbuild dev-server advisories. Vite 6.4.5 fixes all of them. VitePress 1.x officially supports Vite 5, so this was checked by building the site, running the dev server and viewing every diagram page. | VitePress 2 is released as stable and the site is moved to it. |

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
| `orbitdb` (fork) | Dependabot stays on, with the fork's default branch set to the branch we use (`wesense-main-v4`), and it reports 0 alerts. Its own weekly workflow brings in upstream releases and keeps the dev and test tooling secure, see below. |
| Repositories on the private Gitea server | GitHub cannot watch them. |
| `wesense` | Protected by the full-stack test, but nothing auto-merges: its updates are compose image versions, which a person reviews. |
| `wesense-docs` | Protected (the `build` check is required), but nothing auto-merges: its Dependabot PRs wait for a person. |
| `wesense-sensor-firmware` | Protected (the `test` check is required), but nothing auto-merges. The check covers the Python protobuf tooling only (see below); it does not compile the sketch or run on a board, so firmware changes are tested on a device by a person. |

## Adding a new repository

1. Copy `.github/dependabot.yml` from a similar repo and adjust the ecosystems.
2. In **Settings → Advanced Security**, enable Dependabot alerts, security updates, secret scanning, push protection and CodeQL (or use the org-wide defaults).
3. Add a `smoke` job to its `docker-build.yml` (copy one from a similar repo) and the `.github/smoke/` script it calls.
4. Add `dependabot-automerge.yml`, listing the workflow files it should start after a merge (normally just `docker-build.yml`). Make sure each of those has a `workflow_dispatch` trigger.
5. Under **Settings → Branches**, protect `main` and require the checks listed above.

Step 5 matters: without a required check, GitHub merges an auto-merge PR immediately instead of waiting for CI.

## Limitations worth knowing

- The smoke tests prove packages import and the image builds, not that the service behaves correctly. The daily full-stack test starts every service together, but it does not feed real sensor data through. Behavioural tests would make automatic merging safer.
- The replication test uses two stations and fresh data. It does not cover many stations, long-running soak, or data written by older versions (check that by hand when a storage library changes major version, for example `blockstore-fs` or `datastore-fs`).
- A grouped weekly PR can contain a minor bump that is treated like any minor bump: it waits for you, even if most of its contents are patches.
- If no fixed version of a vulnerable package exists, or the fix needs a major upgrade that conflicts with something else, Dependabot cannot open a PR and the alert stays open. An advisory that was never added to GitHub's database raises no alert at all; see *Advisories Dependabot cannot see* above for the one check that covers it.

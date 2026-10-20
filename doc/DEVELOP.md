# Developing satellite-ui

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` | Host half: supported-range check against the installed `satellite` version. |
| `src/client.tsx` | Browser half: the settings page (slot registration + component). |
| `src/client-locales.ts` | `en`/`zh` dictionaries and the `Translate` type. |
| `src/client-styles.ts` | The page's `css` template string (BEM classes, host theme tokens only). |
| `src/role-remote.ts` | Role catalogue reader: mounts the native `satelliteRoles.describe()` Typert Remote contribution and returns its versioned JSON value. |
| `doc/` | This development document; source-only, not part of the published package. |
| `lib/` | Build output — generated, never edited by hand, not meant to be committed. |

## Runtime behavior

The README covers what a user sees; these are the implementation details behind it.

- Installation checks run twice. The Host checks its resolved package version, and the
  browser also checks the actual installed bundle directory through the existing
  read-only `remote.pluginManager.listBundles()` API, before editing and again before
  saving. A Host error alone is not assumed to prevent client loading.
- The page subscribes to `configForms.get('satellite-node')`; there is no namespace
  guessing or polling. Its `base`, `user` and `value` snapshots distinguish inherited
  configuration from profile overrides.
- The sparse editor reads the existing `configForms.describe()` schema envelope through
  `settingsSchema.rehydrate()` / `nodeAtPath()` and compares the complete schema-default
  routes with `snapshot.base.routes`. All fields, including reasoning effort and token
  limits, matter; object key order and route ordering do not. Both the form and schema
  mirror are subscribed, and the same check runs immediately before every write, so a
  stale draft cannot bypass it.
- Saving uses the revision captured when editing began. When no explicit routes remain,
  the page uses the native `unset` operation; other settings are not rewritten.
- The section shows one tab per namespace the Host actually serves (`roles` for
  `satellite-node`, `android` for `satellite-android`); a plugin that serves none
  contributes no tab. Inside a tab, roles render as one card each: the card head holds the
  label, role id and an origin badge (declared, override, inherited or deployment default),
  the card body holds provider/model, and the card footer holds the per-role actions, which
  the stylesheet hides when empty. Android execution settings use the same field grid:
  three `fieldset` groups (enable/privacy, paths, limits), two columns once the section
  itself is at least 560px wide (a container query, not the viewport width).

## Check a change

```sh
npm install
npm run build
npm run typecheck
npm test          # builds first, then runs node --test test/*.test.mjs against lib/
```

`test/client.test.mjs` loads `lib/client.js` in a `vm` with a fake `window.__ModuleLoader__`,
a fake locale service and fake slots, then drives the component — so the browser half is
covered without a browser. Tests use stateful class-method controllers (including boolean
refusal and revision conflicts) and the built browser module. They do not replace
verification in the real Harness GUI.

## Release

`node_modules/` and `lib/` are generated. The published package contains exactly nine files:
`LICENSE`, `README.md`, `cordis.patch.yml`, `icon.svg`, `lib/index.js`, `lib/client.js`,
`locale/en.json`, `locale/zh.json` and `package.json`. The `main` branch additionally carries
the generated `.release.json` record, so a published `main` tree contains exactly ten files.
This document is source-only: `doc/` is not listed in `package.json` `files`, so it appears in
neither the npm tarball nor the `main` artifact branch.

### Branches

- `source` holds source, tests, workflows and this document; development and pull requests
  target it.
- `main` is the artifact branch. It contains the latest stable package plus `.release.json`
  and is updated only by the release workflow. Do not commit source to it or merge it back.
- A `v<version>` tag points at a commit in `source` history. The version must match
  `package.json`, the `version` field in `package-lock.json` and its root
  `packages[""].version` entry, and must be stable or prerelease SemVer without build
  metadata.

### Version bump

Update the same three fields in one commit: `version` in `package.json`, and the top-level
`version` plus `packages[""].version` in `package-lock.json`. A hand edit of those fields is
enough; running `npm install --package-lock-only` after changing `package.json` is an
alternative, so check its diff if you use it. The release workflow compares the pushed tag
`v<version>` against all three values, so a local bump without a matching tag publishes
nothing. A UI-only bump leaves dependency and peer ranges unchanged.

### Release procedure

Publishing is a separate maintainer step taken after the change is reviewed; the order
below is what a release run requires, not something that local work performs.

1. Push the source branch and let the `check` workflow pass on the commit to be tagged.
   The release workflow reads `.github/workflows/release.yml` from that commit, so the tag
   must include it.
2. Create and push the release tag `v<version>`, matching the `version` in `package.json`
   for that release. The workflow compares the tag against `package.json` and both
   lockfile versions, so any other tag fails the version check. Pushing the tag is what
   triggers the workflow; a local tag alone does nothing.
3. An ordinary stable release appends its artifact commit to the existing `main` branch
   as a fast-forward, so `main` stays the latest published package.
4. Only an initial deployment — one where `main` does not exist yet — creates `main` with
   a parentless artifact commit containing the nine package files plus `.release.json`.
   That case also needs an administrator to switch the repository's default branch to
   `main`, so installers that read the default branch receive the published package rather
   than the source tree.

### Permissions and protection

Repository settings are a deployment prerequisite and are not configured by this
repository. The release job uses the workflow `GITHUB_TOKEN` with `contents: write` to
create the Release and push `main`; the workflow's top-level permissions stay at
`contents: read`, and only the release job is elevated. Any branch protection added later
must allow that push (or provide a dedicated credential). No GitHub App, branch protection
rule or repository default-branch change is applied as part of this checkout.

### What the workflow does

1. Verifies the tagged commit is an ancestor of the pushed `source` branch.
2. Validates the tag, package version and both lockfile versions.
3. Runs `npm ci`, `npm run typecheck` and `npm test` (build plus tests).
4. Runs `npm pack` and asserts the tarball contains exactly the nine files above, then
   renames it to `release.tgz`.
5. Creates the GitHub Release. Prereleases are marked Pre-release and never update
   `main`. If the Release already exists, the workflow downloads its published asset for
   synchronization instead of replacing it.
6. For stable versions only, runs `scripts/publish-main.mjs`. It extracts that same asset,
   writes `.release.json` with `version`, `tag` and `sourceCommit`, builds a commit from a
   private index (leaving the checked-out source index and worktree untouched) and pushes
   it to `main` without force. The push must be a fast-forward; if another writer moved
   `main`, it fails rather than rewriting history.

`main` never goes backwards: a release older than the recorded version is skipped, a retry
of the same version and source commit is a no-op, and the same version pointing at a
different source commit is rejected. Publish one tag at a time; the workflow serializes
releases globally without cancelling a running one. If the Release succeeded but `main`
synchronization failed, rerun the workflow — it downloads the already published asset. If a
partially created Release is missing the asset, inspect and repair or remove it before
retrying.

Local preparation and local commits never create a tag, push a branch or publish a
release: those are maintainer actions belonging to the release step above. The workflow
runs only when a matching tag is pushed, so working in a checkout of this source tree
tags, pushes and publishes nothing by itself.

## Version range

`SUPPORTED_MAIN_RANGE` in `src/index.ts` must stay in sync with the `satellite` entry in
`peerDependencies`. `satellite` is the only optional peer (`peerDependenciesMeta`): it is
distributed from GitHub rather than npm, so `npm ci` must not require it, while the Host
half still throws when it resolves no version — an install without the functional plugin
fails at load rather than degrading. The root `peerDependenciesMeta` in
`package-lock.json` must match `package.json`; `test/package.test.mjs` asserts that
consistency so `npm ci` and the manifest cannot drift. In this checkout both packages are
linked into the same profile, which satisfies the runtime peer locally; publishing must go
functional plugin first. The version lookup tries, in order: this package's own location, the sibling
directory `../satellite` in a checkout, and `DSH_PROFILE_DIR` (needed when the profile links the
package instead of installing it).

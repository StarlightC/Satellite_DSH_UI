# satellite-ui

Optional settings UI for satellite. The functional plugin does not require this
package.

## Scope and requirements

- Node.js `^22.19.0 || >=24.0.0`.
- Installed, enabled `satellite` at a stable version `>=0.1.0 <0.2.0`. Install the
  functional plugin from its GitHub repository first: it is not distributed through npm.
  It is required at runtime: the Host half refuses to load when `satellite` is missing or
  outside the range, so it has to be resolvable wherever this package is installed.
- Changes affect **the entire current profile**, not just the open project.

Install the functional plugin from GitHub before this package; the functional plugin does
not require this package, so the release order is functional plugin → UI.

Install through the Harness **Plugins** page. The page is mounted only while the
functional `satellite-node` settings namespace is served. Unknown, unavailable,
prerelease or incompatible versions fail closed with a retry action.

## Defaults and overrides

The page distinguishes inherited configuration from profile overrides. Code defaults,
including newly added roles, remain visible without being copied into a saved profile
snapshot.

Only explicit role overrides are saved. **Follow default**, clearing a selection, or
leaving a row incomplete removes that override: it does not disable the role. When no
explicit routes remain, the page uses the native `unset` operation. Other settings are
not rewritten. Existing advanced route fields (`reasoningEffort`, `maxTokens`) survive
provider/model edits. Duplicate role names are rejected.

Provider/model options come from the live catalogue. A complete catalogue clears overrides
whose routes are no longer listed, with an explicit warning listing the affected roles.
A partial catalogue failure offers retry and does not delete untouched overrides. Catalogue
failure falls back to text inputs. Saving uses the revision captured when editing began; a
rejected write or concurrent modification preserves the draft. Discard changes reloads the
latest values.

The editor supports code defaults plus profile overrides, not arbitrary lower-layer route
arrays. Editing is disabled when defaults contain duplicate roles, route metadata is
unavailable, defaults are malformed, or a differing lower-layer route array is detected;
the same check runs immediately before every write, and a blocked draft survives recovery.
Arrays replace across deployment layers rather than merge per role. If a custom lower layer
is detected, edit that deployment composition instead; this UI never materializes its route
array as a purported sparse profile override. Missing `user` is valid and means there are no
profile overrides.

Inherited model display is guaranteed only for the built-in roles exposed in the code
schema defaults. A custom role without an explicit route is labelled as a deployment-owned
default that this page cannot resolve; its provider/model are not invented. Configure its
route explicitly when using this page. The functional plugin owns validation and migration
rules for ordinary role configuration.

## License

MIT — see [LICENSE](LICENSE).

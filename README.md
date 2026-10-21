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

## Plugin roles

Role names are read-only; the page does not create roles. Friendly names,
responsibilities, node/phase bindings, extensions, trigger conditions, skills and
sandbox file permissions are supplied by the functional plugin, not hardcoded in UI.
Expand a role to inspect all bindings. These are configuration and registered bindings,
not a task match, readiness or permission approval. The file sandbox is the role's
configured limit; actual permissions are also restricted by the parent session.
A defined role with no bindings is labelled as
having no current binding, not as undefined. Catalogue roles, including custom roles,
appear even when absent from the legacy `declaredRoles` setting.

The metadata contract is `RoleCatalog { version: 1, roles: [{ role, label,
description, skill?, sandbox, bindings: [{ node, phase, extension?, skill?,
objective?, condition }] }] }`. `sandbox` is `read-only`, `workspace-write` or
`danger-full-access`; `phase` is `base`, `before` or `after`; `condition` is a
plugin-provided readable string. Missing, malformed or unsupported catalogue versions
show **Role descriptions unavailable / unable to verify bindings**, preserve settings,
and disable editing/cleanup until reload succeeds. Legacy declarations are not proof
of a valid role or binding.

Routes whose role is absent from a valid catalogue are labelled **Not associated with
a role; will not execute**. Their models are read-only, and ordinary saves preserve
unknown providers/models, whitespace and all advanced/unknown fields unchanged.
**Clean up route** stages removal of that profile route only; Save applies it and
Discard cancels it. This never removes ordinary `roles` configuration or metadata.
Inherited deployment defaults are not deleted by profile cleanup.

The page mounts the native Typert Remote `satelliteRoles.describe()` contribution
and validates its versioned JSON response; it adds no HTTP server or custom transport.
This no-argument `src-json` result path targets the Host `0.2.1-alpha.2` public contract,
not a generated strict result codec. Role descriptions reload when opening the page or
using **Reload role descriptions**; extension changes are not pushed live. Update both
packages together: an older functional plugin without this service remains read-only.

## Defaults and overrides

The page distinguishes inherited configuration from profile overrides. Code defaults,
including newly added roles, remain visible without being copied into a saved profile
snapshot.

Only explicit role overrides are saved. **Follow default**, clearing a selection, or
leaving a row incomplete removes that override: it does not disable the role. When no
explicit routes remain, the page uses the native `unset` operation. Other settings are
not rewritten. Existing advanced route fields (`reasoningEffort`, `maxTokens`) survive
provider/model edits. Role identities cannot be edited.

Provider/model options for defined roles come from the live model catalogue. A complete
model catalogue clears defined-role overrides whose models are no longer listed, with an
explicit warning listing the affected roles. Unassociated routes are exempt from this cleanup.
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

Inherited model display is available for roles whose routes are exposed in the code
schema defaults. A custom role without an explicit route is labelled as a deployment-owned
default that this page cannot resolve; its provider/model are not invented. Configure its
route explicitly when using this page. The functional plugin owns validation and migration
rules for ordinary role configuration.

## License

MIT — see [LICENSE](LICENSE).

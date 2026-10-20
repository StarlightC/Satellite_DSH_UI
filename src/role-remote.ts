/** Read-only role catalogue on the Host's existing native Remote carrier. */
import type { Context } from '@deepseek-ai/cordis'

// Public TypertRemoteContribution shape (Host 0.2.1-alpha.2). No generated strict
// result codec is claimed: the caller validates the versioned JSON catalogue.
export const ROLE_REMOTE = {
  package: 'satellite',
  descriptors: [{
    id: 'satellite#satelliteRoles/describe',
    service: 'satelliteRoles', namespace: 'satelliteRoles', method: 'describe',
    invocation: { kind: 'direct' }, parameters: [], result: { mode: 'src-json' },
  }],
} as const

interface NativeRemote {
  $mount(contribution: typeof ROLE_REMOTE): Promise<() => Promise<void>>
}
interface RolesApi {
  describe(): Promise<{ ok: boolean; value?: unknown }>
}

/** One mount per UI instance; native $mount owns its teardown in this Context. */
export function createRoleReader(ctx: Context): () => Promise<unknown> {
  let mounting: Promise<unknown> | undefined
  return async () => {
    const remote = ctx.get('remote') as NativeRemote | undefined
    if (!remote || typeof remote.$mount !== 'function') return undefined
    mounting ??= Promise.resolve().then(() => remote.$mount(ROLE_REMOTE)).catch((error: unknown) => {
      mounting = undefined
      throw error
    })
    await mounting
    // Mount before resolving the generated namespace; making it a bootstrap
    // inject dependency would deadlock the plugin that provides the contribution.
    const api = ctx.get('remote.satelliteRoles') as RolesApi | undefined
    if (!api || typeof api.describe !== 'function') return undefined
    const response = await api.describe()
    return response.ok ? response.value : undefined
  }
}

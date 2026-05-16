import type { DuelystPackageAudit } from '../src/types'

export function inspectDuelystPackage(
    appRoot: string,
    options?: {
        packagePath?: string
        stageTopCount?: number
        candidateLimit?: number | 'all'
    },
): Promise<DuelystPackageAudit>

export function duelystLabelSchema(): Record<string, unknown>

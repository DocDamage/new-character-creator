import type { DuelystPackageAudit } from '../src/types'

export function inspectDuelystPackage(
    appRoot: string,
    options?: {
        packagePath?: string
        stageTopCount?: number
    },
): Promise<DuelystPackageAudit>

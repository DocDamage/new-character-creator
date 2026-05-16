import type { Dispatch, SetStateAction } from 'react'
import type { ApesPreflightReport } from '../types'

type SettingsPanelProps = {
  manifestAssetRoot: string
  assetRootInput: string
  setAssetRootInput: (value: string) => void
  settingsStatus: string
  settingsBusy: boolean
  copyCommand: (command: string, successMessage: string) => Promise<void>
  downloadLocalSetupBundle: () => void
  runLocalAssetTool: (action: 'repair' | 'reindex') => Promise<void>
  apesPythonPath: string
  setApesPythonPath: (value: string) => void
  apesAllowPlaceholder: boolean
  setApesAllowPlaceholder: Dispatch<SetStateAction<boolean>>
  apesPreflight: ApesPreflightReport | null
}

export function SettingsPanel({
  manifestAssetRoot,
  assetRootInput,
  setAssetRootInput,
  settingsStatus,
  settingsBusy,
  copyCommand,
  downloadLocalSetupBundle,
  runLocalAssetTool,
  apesPythonPath,
  setApesPythonPath,
  apesAllowPlaceholder,
  setApesAllowPlaceholder,
  apesPreflight,
}: SettingsPanelProps) {
  const normalizedAssetRoot = assetRootInput.trim() || manifestAssetRoot
  const manifestRootForCompare = normalizeAssetRootForCompare(manifestAssetRoot)
  const targetRootForCompare = normalizeAssetRootForCompare(normalizedAssetRoot)
  const manifestIsStale = Boolean(manifestRootForCompare && targetRootForCompare && manifestRootForCompare !== targetRootForCompare)
  const escapedAssetRoot = normalizedAssetRoot.replaceAll('"', '\\"')
  const escapedPythonPath = apesPythonPath.trim().replaceAll('"', '\\"')
  const repairCommand = `npm run repair:manifest-paths -- --asset-root "${escapedAssetRoot}"`
  const reindexCommand = `npm run index:assets -- --asset-root "${escapedAssetRoot}"`
  const exportCommand = `npm run export:character -- 1-warrior-woman --asset-root "${escapedAssetRoot}"`
  const apesSetupCommand = '.\\tools\\apes_bridge\\setup_home_pc.ps1'
  const apesPreflightCommand = apesPythonPath.trim()
    ? `"${escapedPythonPath}" tools/apes_bridge/check_apes_env.py --json`
    : 'python tools/apes_bridge/check_apes_env.py --json'
  const browserRegressionCommand = 'npm run test:browser'
  const apesPlaceholderLabel = apesAllowPlaceholder ? 'Placeholder APES fallback enabled for UI-only testing.' : 'Real APES bridge only. Placeholder fallback is disabled.'

  return (
    <section className="panel wide-panel settings-panel">
      <div className="panel-heading">
        <div>
          <h3>Settings</h3>
          <p>Use these buttons when the sprite pack moves to a different path on a new machine.</p>
        </div>
      </div>

      <div className="settings-grid">
        <article className="settings-card">
          <strong>Indexed manifest root</strong>
          <code>{manifestAssetRoot || 'manifest not loaded'}</code>
        </article>
        <article className="settings-card">
          <strong>Target asset root</strong>
          <label className="field">
            <span>Asset pack folder</span>
            <input data-testid="settings-asset-root-input" value={assetRootInput} onChange={(event) => setAssetRootInput(event.target.value)} placeholder="Paste the local asset-pack path" />
          </label>
        </article>
        <article className="settings-card">
          <strong>APES Python path</strong>
          <label className="field">
            <span>Interpreter on the APES machine</span>
            <input data-testid="settings-apes-python-input" value={apesPythonPath} onChange={(event) => setApesPythonPath(event.target.value)} placeholder="C:\\Users\\you\\miniconda3\\envs\\apes-gpu\\python.exe" />
          </label>
          <span>Leave blank to use the Python running npm run dev. Set this to the dedicated APES env on your home GPU PC.</span>
        </article>
      </div>

      {manifestIsStale ? (
        <div className="settings-card settings-card-warning">
          <strong>Manifest stale</strong>
          <span>The manifest is indexed against a different asset root than the one you plan to use. Run repair or reindex before exporting so the app and CLI read the same files.</span>
        </div>
      ) : null}

      <div className="settings-actions">
        <button className="primary" onClick={() => void runLocalAssetTool('repair')} disabled={!import.meta.env.DEV || settingsBusy}>Run repair now</button>
        <button onClick={() => void runLocalAssetTool('reindex')} disabled={!import.meta.env.DEV || settingsBusy}>Run reindex now</button>
        <button className="primary" onClick={() => void copyCommand(repairCommand, 'Repair command copied. Run it in the terminal to rewrite manifest paths.')}>Copy repair command</button>
        <button onClick={() => void copyCommand(reindexCommand, 'Reindex command copied. Run it to rebuild the manifest from the new asset root.')}>Copy reindex command</button>
        <button onClick={() => void copyCommand(exportCommand, 'Export command copied. Run it after repairing or reindexing to verify the new root.')}>Copy sample export command</button>
        <button className="primary" onClick={() => void copyCommand(apesSetupCommand, 'APES setup command copied. Run it on the home GPU PC to build the APES environment.')}>Copy APES setup command</button>
        <button onClick={() => void copyCommand(apesPreflightCommand, 'APES preflight command copied. Run it with the configured interpreter to verify the APES machine.')}>Copy APES preflight command</button>
        <button data-testid="copy-browser-regression-command" onClick={() => void copyCommand(browserRegressionCommand, 'Browser regression command copied. Run it to validate exports and manual mask persistence.')}>Copy browser regression command</button>
        <button data-testid="download-local-setup-bundle" onClick={downloadLocalSetupBundle}>Download local setup bundle</button>
        <button onClick={() => setAssetRootInput(manifestAssetRoot)}>Use indexed root</button>
      </div>

      <div className="settings-card">
        <strong>Portable setup bundle</strong>
        <span>Download a machine-ready markdown checklist with the current asset root, APES interpreter, setup commands, and browser regression command filled in.</span>
      </div>

      <div className="settings-card">
        <strong>Browser regression harness</strong>
        <span>Use the Playwright harness when you want one repeatable local check for rendered exports, full-package downloads, and manual mask persistence.</span>
        <code>{browserRegressionCommand}</code>
      </div>

      <div className="settings-card">
        <strong>APES bridge mode</strong>
        <label className="field checkbox-field">
          <input type="checkbox" checked={apesAllowPlaceholder} onChange={(event) => setApesAllowPlaceholder(event.target.checked)} />
          <span>Allow placeholder APES fallback for UI-only testing on non-GPU machines</span>
        </label>
        <span>{apesPlaceholderLabel}</span>
      </div>

      <div className="settings-card">
        <strong>Direct actions</strong>
        <span>{import.meta.env.DEV ? 'Run repair or reindex directly when the app is started with npm run dev.' : 'Direct actions only work in dev mode. Use the copy-command buttons in preview or production builds.'}</span>
      </div>

      <div className={`settings-card ${apesPreflight && !apesPreflight.ready ? 'settings-card-warning' : ''}`}>
        <strong>Latest APES preflight</strong>
        <span>{apesPreflight ? (apesPreflight.ready ? `Ready with ${apesPreflight.python.executable}` : apesPreflight.findings[0] ?? 'APES preflight failed.') : 'No APES preflight report yet.'}</span>
        {apesPreflight ? <code>{apesPreflight.findings.length > 0 ? apesPreflight.findings.join('\n') : 'No findings. APES runtime is ready.'}</code> : null}
      </div>

      <div className="settings-card">
        <strong>Status</strong>
        <span>{settingsStatus}</span>
      </div>

      <div className="settings-card">
        <strong>Commands preview</strong>
        <code>{repairCommand}</code>
        <code>{reindexCommand}</code>
        <code>{exportCommand}</code>
        <code>{browserRegressionCommand}</code>
        <code>{apesSetupCommand}</code>
        <code>{apesPreflightCommand}</code>
      </div>
    </section>
  )
}

function normalizeAssetRootForCompare(assetRoot: string) {
  return assetRoot.trim().replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase()
}
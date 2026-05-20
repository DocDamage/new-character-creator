import { useState, type Dispatch, type SetStateAction } from 'react'
import { localToolFetch, localToolPath } from '../localToolsClient'
import type { AiProviderConnection, ApesPreflightReport, ToolConnectionSettings } from '../types'

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
  localToolsAvailable: boolean
  aiProviders: AiProviderConnection[]
  setAiProviders: (providers: AiProviderConnection[]) => void
  toolConnections: ToolConnectionSettings
  setToolConnections: (connections: ToolConnectionSettings) => void
  sessionSecretStatus: Record<string, boolean>
  sessionSecretMemoryCount: number
  setAiSessionSecret: (providerId: string, secret: string) => void
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
  localToolsAvailable,
  aiProviders,
  setAiProviders,
  toolConnections,
  setToolConnections,
  sessionSecretStatus,
  sessionSecretMemoryCount,
  setAiSessionSecret,
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
  const apesSetupCommand = 'micromamba env update -n apes-gpu-modern -f tools/apes_bridge/environment.gpu.yml'
  const apesPreflightCommand = apesPythonPath.trim()
    ? `"${escapedPythonPath}" tools/apes_bridge/check_apes_env.py --json`
    : 'python tools/apes_bridge/check_apes_env.py --json'
  const browserRegressionCommand = 'npm run test:browser'
  const releaseCheckCommand = 'npm run release:check'
  const productionCheckCommand = 'npm run production:check'
  const localToolsStartCommand = 'node tools/local-vite-server.js dev --host 127.0.0.1 --port 4180'
  const localToolsDefaultUrl = 'http://127.0.0.1:4180/'
  const localProxyStatus = localToolsAvailable ? 'Local proxy reachable on loopback.' : 'Local proxy unavailable in this session.'
  const apesPlaceholderLabel = apesAllowPlaceholder ? 'Placeholder APES fallback enabled for UI-only testing.' : 'Real APES bridge only. Placeholder fallback is disabled.'
  const enabledProviderCount = aiProviders.filter((provider) => provider.enabled).length
  const armedProviderCount = aiProviders.filter((provider) => provider.secret_session_set || provider.secret_storage === 'none').length
  const [bridgeStatus, setBridgeStatus] = useState('Use defaults to enable a local bridge, then run a check from this browser session.')

  function updateProvider(providerId: string, patch: Partial<AiProviderConnection>) {
    setAiProviders(aiProviders.map((provider) => provider.provider_id === providerId ? { ...provider, ...patch } : provider))
  }

  function markSecretStatus(providerId: string, isSet: boolean) {
    setAiProviders(aiProviders.map((provider) => provider.provider_id === providerId ? { ...provider, secret_session_set: isSet } : provider))
  }

  function updateSessionSecret(providerId: string, secret: string) {
    setAiSessionSecret(providerId, secret)
    markSecretStatus(providerId, secret.trim().length > 0)
  }

  function applyAsepriteDefaults() {
    setToolConnections({
      ...toolConnections,
      aseprite: {
        ...toolConnections.aseprite,
        enabled: true,
        bridge_url: toolConnections.aseprite.bridge_url || 'http://127.0.0.1:32123',
        script_folder: toolConnections.aseprite.script_folder || 'tools/aseprite',
      },
    })
    setBridgeStatus('Aseprite bridge defaults enabled. Add the executable path if you want the local bridge to launch Aseprite directly.')
  }

  function applyPixelLabDefaults() {
    setToolConnections({
      ...toolConnections,
      pixellab: {
        ...toolConnections.pixellab,
        enabled: true,
        endpoint_url: toolConnections.pixellab.endpoint_url || 'http://127.0.0.1:8787',
        mcp_server_url: toolConnections.pixellab.mcp_server_url || 'https://api.pixellab.ai/mcp',
        preferred_model: toolConnections.pixellab.preferred_model || 'sprite-animation',
      },
    })
    setBridgeStatus('PixelLab defaults enabled. Direct app calls still use a loopback proxy; keep the PixelLab MCP bearer token only in your local MCP environment.')
  }

  function applyLocalLlmDefaults() {
    setToolConnections({
      ...toolConnections,
      local_llm: {
        ...toolConnections.local_llm,
        enabled: true,
        provider: toolConnections.local_llm.provider || 'ollama',
        endpoint_url: toolConnections.local_llm.endpoint_url || 'http://127.0.0.1:11434',
        model: toolConnections.local_llm.model || 'llama3.1',
      },
    })
    setBridgeStatus('Local LLM defaults enabled for Ollama. Switch provider/model here if you use LM Studio or another loopback server.')
  }

  async function openLocalToolsApp() {
    if (localToolsAvailable) {
      window.location.assign('/')
      return
    }
    await copyCommand(localToolsStartCommand, 'Local-tools start command copied. Run it in PowerShell, then use the opened local-tools tab.')
    window.open(localToolsDefaultUrl, '_blank', 'noopener,noreferrer')
    setBridgeStatus(`Opened ${localToolsDefaultUrl}. If it does not load, run the copied command first.`)
  }

  async function checkAsepriteBridge() {
    await checkLocalBridge('Aseprite', localToolPath('bridge/aseprite'), {
      action: 'check',
      executablePath: toolConnections.aseprite.executable_path,
      bridgeUrl: toolConnections.aseprite.bridge_url,
    })
  }

  async function checkPixelLabBridge() {
    await checkLocalBridge('PixelLab', localToolPath('bridge/pixellab'), {
      endpointUrl: toolConnections.pixellab.endpoint_url,
      mcpServerUrl: toolConnections.pixellab.mcp_server_url,
      prompt: 'Pixel Creator bridge health check for a single idle frame.',
      animation: 'idle',
    })
  }

  async function checkLocalLlm() {
    await checkLocalBridge('Local LLM', localToolPath('ai/proxy'), {
      provider: toolConnections.local_llm.provider,
      model: toolConnections.local_llm.model,
      baseUrl: toolConnections.local_llm.endpoint_url,
      messages: [{ role: 'user', content: 'Reply with Pixel Creator local LLM bridge OK.' }],
    })
  }

  async function checkLocalBridge(label: string, url: string, body: unknown) {
    setBridgeStatus(`Checking ${label} through the local proxy...`)
    try {
      const response = await localToolFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? `${label} check failed with status ${response.status}`)
      setBridgeStatus(`${label} check passed. The app can request this tool after you approve the AI-proposed action.`)
    } catch (error) {
      setBridgeStatus(`${label} check failed. ${error instanceof Error ? error.message : String(error)}`)
    }
  }

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
          <span>Leave blank to use the Python running the local Vite server. Set this to the dedicated APES env on your home GPU PC.</span>
        </article>
      </div>

      {manifestIsStale ? (
        <div className="settings-card settings-card-warning">
          <strong>Manifest stale</strong>
          <span>The manifest is indexed against a different asset root than the one you plan to use. Run repair or reindex before exporting so the app and CLI read the same files.</span>
        </div>
      ) : null}

      <div className="settings-actions">
        <button className="primary" onClick={() => void runLocalAssetTool('repair')} disabled={!localToolsAvailable || settingsBusy}>Run repair now</button>
        <button onClick={() => void runLocalAssetTool('reindex')} disabled={!localToolsAvailable || settingsBusy}>Run reindex now</button>
        <button className="primary" onClick={() => void copyCommand(repairCommand, 'Repair command copied. Run it in the terminal to rewrite manifest paths.')}>Copy repair command</button>
        <button onClick={() => void copyCommand(reindexCommand, 'Reindex command copied. Run it to rebuild the manifest from the new asset root.')}>Copy reindex command</button>
        <button onClick={() => void copyCommand(exportCommand, 'Export command copied. Run it after repairing or reindexing to verify the new root.')}>Copy sample export command</button>
        <button className="primary" onClick={() => void copyCommand(apesSetupCommand, 'APES setup command copied. Run it on the home GPU PC to build the APES environment.')}>Copy APES setup command</button>
        <button onClick={() => void copyCommand(apesPreflightCommand, 'APES preflight command copied. Run it with the configured interpreter to verify the APES machine.')}>Copy APES preflight command</button>
        <button data-testid="copy-browser-regression-command" onClick={() => void copyCommand(browserRegressionCommand, 'Browser regression command copied. Run it to validate exports and manual mask persistence.')}>Copy browser regression command</button>
        <button data-testid="copy-release-check-command" onClick={() => void copyCommand(releaseCheckCommand, 'Release check command copied. Run it before packaging or handoff.')}>Copy release check command</button>
        <button data-testid="download-local-setup-bundle" onClick={downloadLocalSetupBundle}>Download local setup bundle</button>
        <button data-testid="open-local-tools-app" className="primary" onClick={() => void openLocalToolsApp()}>{localToolsAvailable ? 'Open local-tools root' : 'Open local-tools app'}</button>
        <button data-testid="copy-local-tools-start-command" onClick={() => void copyCommand(localToolsStartCommand, 'Local-tools start command copied. Run it in PowerShell, then open http://127.0.0.1:4180/.')}>Copy local-tools start command</button>
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
        <code>{releaseCheckCommand}</code>
      </div>

      <div className="settings-card">
        <strong>AI provider vault</strong>
        <span>{enabledProviderCount} provider(s) enabled, {armedProviderCount} session/local provider(s) armed, {sessionSecretMemoryCount} volatile secret(s) held in page memory. Secrets are never written to persisted project config, exports, release bundles, or handoff JSON.</span>
        <code>{localProxyStatus}</code>
        <code>Use local proxies for direct calls from GitHub Pages. Browser-entered secrets are session-only and cleared when the browser session ends.</code>
      </div>

      <div className="settings-card ai-provider-vault" data-testid="ai-provider-vault">
        <strong>LLM providers</strong>
        {aiProviders.map((provider) => (
          <article key={provider.provider_id} className="provider-row">
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={provider.enabled}
                onChange={(event) => updateProvider(provider.provider_id, { enabled: event.target.checked })}
              />
              <span>{provider.name}</span>
            </label>
            <label className="field">
              <span>Model</span>
              <input value={provider.model} onChange={(event) => updateProvider(provider.provider_id, { model: event.target.value })} />
            </label>
            <label className="field">
              <span>Base URL</span>
              <input value={provider.base_url} onChange={(event) => updateProvider(provider.provider_id, { base_url: event.target.value })} />
            </label>
            {provider.secret_storage === 'session_only' ? (
              <div className="provider-secret-controls">
                <label className="field">
                  <span>Session secret</span>
                  <input
                    data-testid={`ai-secret-${provider.provider_id}`}
                    type="password"
                    autoComplete="off"
                    defaultValue=""
                    placeholder={sessionSecretStatus[provider.provider_id] ? 'set for this session' : 'paste to arm session'}
                    onChange={(event) => updateSessionSecret(provider.provider_id, event.target.value)}
                  />
                </label>
                <button
                  onClick={(event) => {
                    updateSessionSecret(provider.provider_id, '')
                    const input = event.currentTarget.parentElement?.querySelector('input')
                    if (input) input.value = ''
                  }}
                  disabled={!sessionSecretStatus[provider.provider_id]}
                >
                  Clear
                </button>
              </div>
            ) : (
              <span>Local endpoint, no provider secret required.</span>
            )}
            <code>{provider.notes}</code>
          </article>
        ))}
      </div>

      <div className="settings-card" data-testid="ai-tool-connections">
        <strong>Tool connections</strong>
        <div className="settings-grid">
          <article>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={toolConnections.aseprite.enabled}
                onChange={(event) => setToolConnections({ ...toolConnections, aseprite: { ...toolConnections.aseprite, enabled: event.target.checked } })}
              />
              <span>Aseprite bridge</span>
            </label>
            <label className="field">
              <span>Executable path</span>
              <input value={toolConnections.aseprite.executable_path} onChange={(event) => setToolConnections({ ...toolConnections, aseprite: { ...toolConnections.aseprite, executable_path: event.target.value } })} />
            </label>
            <label className="field">
              <span>Bridge URL</span>
              <input value={toolConnections.aseprite.bridge_url} onChange={(event) => setToolConnections({ ...toolConnections, aseprite: { ...toolConnections.aseprite, bridge_url: event.target.value } })} />
            </label>
            <label className="field">
              <span>Script folder</span>
              <input value={toolConnections.aseprite.script_folder} onChange={(event) => setToolConnections({ ...toolConnections, aseprite: { ...toolConnections.aseprite, script_folder: event.target.value } })} />
            </label>
            <button type="button" onClick={applyAsepriteDefaults}>Use Aseprite defaults</button>
          </article>
          <article>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={toolConnections.pixellab.enabled}
                onChange={(event) => setToolConnections({ ...toolConnections, pixellab: { ...toolConnections.pixellab, enabled: event.target.checked } })}
              />
              <span>PixelLab</span>
            </label>
            <label className="field">
              <span>Endpoint URL</span>
              <input value={toolConnections.pixellab.endpoint_url} onChange={(event) => setToolConnections({ ...toolConnections, pixellab: { ...toolConnections.pixellab, endpoint_url: event.target.value } })} />
            </label>
            <label className="field">
              <span>MCP server URL</span>
              <input value={toolConnections.pixellab.mcp_server_url} onChange={(event) => setToolConnections({ ...toolConnections, pixellab: { ...toolConnections.pixellab, mcp_server_url: event.target.value } })} />
            </label>
            <label className="field">
              <span>Preferred model</span>
              <input value={toolConnections.pixellab.preferred_model} onChange={(event) => setToolConnections({ ...toolConnections, pixellab: { ...toolConnections.pixellab, preferred_model: event.target.value } })} />
            </label>
            <button type="button" onClick={applyPixelLabDefaults}>Use PixelLab defaults</button>
          </article>
          <article>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={toolConnections.local_llm.enabled}
                onChange={(event) => setToolConnections({ ...toolConnections, local_llm: { ...toolConnections.local_llm, enabled: event.target.checked } })}
              />
              <span>Local LLM</span>
            </label>
            <label className="field">
              <span>Provider</span>
              <select value={toolConnections.local_llm.provider} onChange={(event) => setToolConnections({ ...toolConnections, local_llm: { ...toolConnections.local_llm, provider: event.target.value as ToolConnectionSettings['local_llm']['provider'] } })}>
                <option value="ollama">Ollama</option>
                <option value="lm_studio">LM Studio</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="field">
              <span>Endpoint URL</span>
              <input value={toolConnections.local_llm.endpoint_url} onChange={(event) => setToolConnections({ ...toolConnections, local_llm: { ...toolConnections.local_llm, endpoint_url: event.target.value } })} />
            </label>
            <label className="field">
              <span>Model</span>
              <input value={toolConnections.local_llm.model} onChange={(event) => setToolConnections({ ...toolConnections, local_llm: { ...toolConnections.local_llm, model: event.target.value } })} />
            </label>
            <button type="button" onClick={applyLocalLlmDefaults}>Use local LLM defaults</button>
          </article>
        </div>
        <div className="settings-actions">
          <button data-testid="check-aseprite-bridge" onClick={() => void checkAsepriteBridge()} disabled={!localToolsAvailable}>Check Aseprite bridge</button>
          <button data-testid="check-pixellab-bridge" onClick={() => void checkPixelLabBridge()} disabled={!localToolsAvailable}>Check PixelLab bridge</button>
          <button data-testid="check-local-llm" onClick={() => void checkLocalLlm()} disabled={!localToolsAvailable}>Check local LLM</button>
        </div>
        <span data-testid="tool-bridge-status">{bridgeStatus}</span>
      </div>

      <div className="settings-card">
        <strong>APES bridge mode</strong>
        <label className="field checkbox-field">
          <input type="checkbox" checked={apesAllowPlaceholder} onChange={(event) => setApesAllowPlaceholder(event.target.checked)} />
          <span>Allow placeholder APES fallback for UI-only testing on non-GPU machines</span>
        </label>
        <span>{apesPlaceholderLabel}</span>
        {apesAllowPlaceholder ? (
          <span data-testid="apes-placeholder-warning">Placeholder APES mode is not production segmentation. Exports will record placeholder_mode_enabled so QA can reject accidental placeholder output.</span>
        ) : null}
      </div>

      <div className="settings-card">
        <strong>Direct actions</strong>
        <span>{localToolsAvailable ? 'Local server tools are available in this session, including preview builds served by Vite.' : 'Local server tools are unavailable in this static session. Use Open local-tools app, run the copied command if needed, then use the root URL it opens.'}</span>
        <code>{localToolsStartCommand}</code>
        <code>{localToolsDefaultUrl}</code>
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
        <code>{releaseCheckCommand}</code>
        <code>{productionCheckCommand}</code>
        <code>{localToolsStartCommand}</code>
        <code>{apesSetupCommand}</code>
        <code>{apesPreflightCommand}</code>
      </div>
    </section>
  )
}

function normalizeAssetRootForCompare(assetRoot: string) {
  return assetRoot.trim().replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase()
}

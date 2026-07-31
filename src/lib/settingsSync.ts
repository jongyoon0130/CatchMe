import { resolveModel } from './selfEngine'
import {
  fetchRemoteSettings,
  isCloudSyncAvailable,
  pushSettingsToCloud,
  type RemoteSettingsRow,
} from './cloudSync'
import { loadApiKey, loadModel, loadSettingsUpdatedAt, saveApiKeyLocal, saveModelLocal, setSettingsUpdatedAt } from './storage'

export function buildSettingsCloudPayload() {
  return {
    geminiModel: loadModel(),
    geminiApiKey: loadApiKey(),
    updatedAt: loadSettingsUpdatedAt() || Date.now(),
  }
}

export function scheduleSettingsSync(): void {
  if (!isCloudSyncAvailable()) return
  void pushSettingsToCloud(buildSettingsCloudPayload()).catch(() => {})
}

export async function pushLocalSettings(): Promise<void> {
  await pushSettingsToCloud(buildSettingsCloudPayload())
}

export async function syncSettingsOnLogin(userId: string): Promise<void> {
  const remote = await fetchRemoteSettings(userId)
  if (!remote) {
    if (isCloudSyncAvailable()) await pushLocalSettings().catch(() => {})
    return
  }
  applyRemoteSettings(remote)
}

function applyRemoteSettings(remote: RemoteSettingsRow): void {
  const localTs = loadSettingsUpdatedAt()
  const remoteTs = remote.updated_at ?? 0

  if (remoteTs > localTs) {
    if (remote.gemini_model) {
      saveModelLocal(remote.gemini_model)
    }
    saveApiKeyLocal(remote.gemini_api_key ?? '')
    setSettingsUpdatedAt(remoteTs)
    const resolved = loadModel()
    if (resolved && remote.gemini_model && resolved !== remote.gemini_model.trim()) {
      void pushSettingsToCloud(buildSettingsCloudPayload()).catch(() => {})
    }
    return
  }

  if (localTs > remoteTs) {
    void pushSettingsToCloud(buildSettingsCloudPayload()).catch(() => {})
    return
  }

  if (remote.gemini_model) {
    saveModelLocal(remote.gemini_model)
    const resolved = loadModel()
    if (resolved && resolved !== remote.gemini_model.trim()) {
      void pushSettingsToCloud(buildSettingsCloudPayload()).catch(() => {})
    }
  }
  if (remote.gemini_api_key && !loadApiKey()) {
    saveApiKeyLocal(remote.gemini_api_key)
  }
}

export function saveModelWithCloud(model: string): void {
  saveModelLocal(resolveModel(model))
  setSettingsUpdatedAt(Date.now())
  scheduleSettingsSync()
}

export function saveApiKeyWithCloud(key: string): void {
  saveApiKeyLocal(key)
  setSettingsUpdatedAt(Date.now())
  scheduleSettingsSync()
}

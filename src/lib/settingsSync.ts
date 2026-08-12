import { resolveModel } from './selfEngine'
import {
  fetchRemoteSettings,
  isCloudSyncAvailable,
  pushSettingsToCloud,
  type RemoteSettingsRow,
} from './cloudSync'
import {
  loadModel,
  loadSettingsUpdatedAt,
  loadStoredApiKey,
  saveApiKeyLocal,
  saveModelLocal,
  setSettingsUpdatedAt,
} from './storage'

export function buildSettingsCloudPayload() {
  const storedKey = loadStoredApiKey()?.trim() ?? ''
  return {
    geminiModel: loadModel(),
    // 내장 키는 클라우드에 올리지 않음
    geminiApiKey: storedKey || null,
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
    const remoteKey = remote.gemini_api_key?.trim() ?? ''
    if (remoteKey) {
      saveApiKeyLocal(remoteKey)
    } else {
      saveApiKeyLocal('')
    }
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
  const localStored = loadStoredApiKey()?.trim() ?? ''
  if (remote.gemini_api_key?.trim() && !localStored) {
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

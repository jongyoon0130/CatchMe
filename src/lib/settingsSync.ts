import { resolveModel } from './selfEngine'
import {
  fetchRemoteSettings,
  isCloudSyncAvailable,
  pushSettingsToCloud,
  type RemoteSettingsRow,
} from './cloudSync'
import { loadModel, loadSettingsUpdatedAt, saveModelLocal, setSettingsUpdatedAt } from './storage'

// API 키는 payload에 넣지 않는다 — 이 기기 밖으로 나가지 않는다.
// 예전에는 futureme_settings.gemini_api_key 에 평문으로 올라갔다.
export function buildSettingsCloudPayload() {
  return {
    geminiModel: loadModel(),
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
}

export function saveModelWithCloud(model: string): void {
  saveModelLocal(resolveModel(model))
  setSettingsUpdatedAt(Date.now())
  scheduleSettingsSync()
}

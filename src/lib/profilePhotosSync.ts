import type { ProfilePhotos } from './profilePhotos'
import {
  loadProfilePhotos,
  saveProfilePhotosLocal,
  hasProfilePhotoContent,
  profilePhotosUpdatedAt,
  PROFILE_PHOTOS_SYNC_EVENT,
} from './profilePhotos'
import {
  fetchRemoteProfilePhotos,
  isCloudSyncAvailable,
  pushProfilePhotosToCloud,
  type RemoteProfilePhotosRow,
} from './cloudSync'
import { loadProfileSummaries } from './storage'

let pushTimers = new Map<string, ReturnType<typeof setTimeout>>()

function normalizeRemotePhotos(raw: Record<string, unknown>): ProfilePhotos {
  return {
    presentDataUrl: typeof raw.presentDataUrl === 'string' ? raw.presentDataUrl : undefined,
    futureVisionDataUrl: typeof raw.futureVisionDataUrl === 'string' ? raw.futureVisionDataUrl : undefined,
    futureVisionGeneratedAt:
      typeof raw.futureVisionGeneratedAt === 'number' ? raw.futureVisionGeneratedAt : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
  }
}

function notifyPhotosSynced(): void {
  window.dispatchEvent(new CustomEvent(PROFILE_PHOTOS_SYNC_EVENT))
}

export function scheduleProfilePhotosSync(profileId: string): void {
  if (!isCloudSyncAvailable()) return
  const prev = pushTimers.get(profileId)
  if (prev) clearTimeout(prev)
  pushTimers.set(
    profileId,
    setTimeout(() => {
      pushTimers.delete(profileId)
      const photos = loadProfilePhotos(profileId)
      if (!hasProfilePhotoContent(photos)) return
      void pushProfilePhotosToCloud(profileId, photos, profilePhotosUpdatedAt(photos))
        .then(() => notifyPhotosSynced())
        .catch(() => {})
    }, 800),
  )
}

export async function pushLocalProfilePhotos(): Promise<void> {
  for (const summary of loadProfileSummaries()) {
    const photos = loadProfilePhotos(summary.id)
    if (!hasProfilePhotoContent(photos)) continue
    await pushProfilePhotosToCloud(summary.id, photos, profilePhotosUpdatedAt(photos))
  }
}

/** 로그인 시 클라우드에 사진이 없는데 로컬에만 있는 경우 (migration 전 저장 등) */
async function pushMissingLocalPhotos(remoteRows: RemoteProfilePhotosRow[]): Promise<void> {
  for (const summary of loadProfileSummaries()) {
    const local = loadProfilePhotos(summary.id)
    if (!hasProfilePhotoContent(local)) continue

    const remote = remoteRows.find((row) => row.profile_id === summary.id)
    const remotePhotos = remote ? normalizeRemotePhotos(remote.photos) : null
    if (remotePhotos && hasProfilePhotoContent(remotePhotos)) continue

    const ts = Math.max(profilePhotosUpdatedAt(local), Date.now())
    const payload = { ...local, updatedAt: ts }
    saveProfilePhotosLocal(summary.id, payload)
    await pushProfilePhotosToCloud(summary.id, payload, ts).catch(() => {})
  }
}

export async function syncProfilePhotosOnLogin(userId: string): Promise<void> {
  const remoteRows = await fetchRemoteProfilePhotos(userId)
  mergeProfilePhotos(remoteRows)
  await pushMissingLocalPhotos(remoteRows)
  notifyPhotosSynced()
}

export function mergeProfilePhotos(remoteRows: RemoteProfilePhotosRow[]): void {
  const remoteMap = new Map(remoteRows.map((row) => [row.profile_id, row]))
  const localIds = new Set(loadProfileSummaries().map((s) => s.id))

  for (const profileId of localIds) {
    const local = loadProfilePhotos(profileId)
    const remote = remoteMap.get(profileId)
    if (!remote) {
      if (hasProfilePhotoContent(local)) {
        void pushProfilePhotosToCloud(profileId, local, profilePhotosUpdatedAt(local)).catch(() => {})
      }
      continue
    }

    const remotePhotos = normalizeRemotePhotos(remote.photos)
    const localTs = profilePhotosUpdatedAt(local)
    const remoteTs = remote.updated_at ?? profilePhotosUpdatedAt(remotePhotos)
    const remoteHas = hasProfilePhotoContent(remotePhotos)
    const localHas = hasProfilePhotoContent(local)

    if (remoteHas && remoteTs > localTs) {
      saveProfilePhotosLocal(profileId, { ...remotePhotos, updatedAt: remoteTs })
    } else if (localHas && (!remoteHas || localTs >= remoteTs)) {
      void pushProfilePhotosToCloud(profileId, local, Math.max(localTs, Date.now())).catch(() => {})
    }
    remoteMap.delete(profileId)
  }

  for (const [, remote] of remoteMap) {
    const remotePhotos = normalizeRemotePhotos(remote.photos)
    if (!hasProfilePhotoContent(remotePhotos)) continue
    saveProfilePhotosLocal(remote.profile_id, {
      ...remotePhotos,
      updatedAt: remote.updated_at ?? profilePhotosUpdatedAt(remotePhotos),
    })
  }
}

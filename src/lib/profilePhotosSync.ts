import type { ProfilePhotos } from './profilePhotos'
import { loadProfilePhotos, saveProfilePhotosLocal, hasProfilePhotoContent, profilePhotosUpdatedAt } from './profilePhotos'
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
      void pushProfilePhotosToCloud(profileId, photos, profilePhotosUpdatedAt(photos)).catch(() => {})
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

export async function syncProfilePhotosOnLogin(userId: string): Promise<void> {
  const remoteRows = await fetchRemoteProfilePhotos(userId)
  mergeProfilePhotos(remoteRows)
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

    if (remoteTs > localTs) {
      saveProfilePhotosLocal(profileId, { ...remotePhotos, updatedAt: remoteTs })
    } else if (localTs > remoteTs && hasProfilePhotoContent(local)) {
      void pushProfilePhotosToCloud(profileId, local, localTs).catch(() => {})
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

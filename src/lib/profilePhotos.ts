/** 프로필 사진 — 로컬 저장 + (로그인 시) 클라우드 동기화 */

export interface ProfilePhotos {
  presentDataUrl?: string
  futureVisionDataUrl?: string
  futureVisionGeneratedAt?: number
  updatedAt?: number
}

function photosKey(profileId: string): string {
  return `futureme-profile-photos-${profileId}`
}

export function hasProfilePhotoContent(photos: ProfilePhotos): boolean {
  return Boolean(photos.presentDataUrl || photos.futureVisionDataUrl)
}

export function profilePhotosUpdatedAt(photos: ProfilePhotos): number {
  if (photos.updatedAt) return photos.updatedAt
  if (photos.futureVisionGeneratedAt) return photos.futureVisionGeneratedAt
  // migration·로그인 전 저장분 — 0이면 원격 빈 행에 밀릴 수 있어 최소값 부여
  if (hasProfilePhotoContent(photos)) return 1
  return 0
}

export const PROFILE_PHOTOS_SYNC_EVENT = 'futureme-profile-photos-synced'

export function loadProfilePhotos(profileId: string): ProfilePhotos {
  if (!profileId) return {}
  try {
    const raw = localStorage.getItem(photosKey(profileId))
    if (!raw) return {}
    return JSON.parse(raw) as ProfilePhotos
  } catch {
    return {}
  }
}

/** 클라우드 푸시 없이 로컬만 저장 (다운로드·병합용) */
export function clearProfilePhotos(profileId: string): void {
  if (!profileId) return
  localStorage.removeItem(photosKey(profileId))
}

export function saveProfilePhotosLocal(profileId: string, photos: ProfilePhotos): void {
  if (!profileId) return
  localStorage.setItem(photosKey(profileId), JSON.stringify(photos))
}

export function saveProfilePhotos(profileId: string, photos: ProfilePhotos): void {
  if (!profileId) return
  const withTs = { ...photos, updatedAt: Date.now() }
  saveProfilePhotosLocal(profileId, withTs)
  void import('./profilePhotosSync').then(({ scheduleProfilePhotosSync }) => {
    scheduleProfilePhotosSync(profileId)
  })
}

export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim())
  if (!m) return null
  return { mimeType: m[1], base64: m[2] }
}

/** 업로드용 — 긴 변은 줄이고 JPEG로 압축 */
export async function fileToPortraitDataUrl(file: File, maxSide = 1024): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 올릴 수 있어요.')
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('12MB 이하 사진만 올릴 수 있어요.')
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('사진을 처리하지 못했어요.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
  canvas.width = 0
  canvas.height = 0
  return dataUrl
}

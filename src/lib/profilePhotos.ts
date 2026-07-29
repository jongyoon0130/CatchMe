/** 프로필 사진 — 로컬 전용 (클라우드 동기화 X, 용량 큼) */

export interface ProfilePhotos {
  presentDataUrl?: string
  futureVisionDataUrl?: string
  futureVisionGeneratedAt?: number
}

function photosKey(profileId: string): string {
  return `futureme-profile-photos-${profileId}`
}

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

export function saveProfilePhotos(profileId: string, photos: ProfilePhotos): void {
  if (!profileId) return
  localStorage.setItem(photosKey(profileId), JSON.stringify(photos))
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

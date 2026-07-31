import { describe, expect, test, beforeEach } from 'bun:test'
import { mergeProfilePhotos } from '../src/lib/profilePhotosSync'
import {
  loadProfilePhotos,
  saveProfilePhotosLocal,
  type ProfilePhotos,
} from '../src/lib/profilePhotos'

const PROFILE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PROFILE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function seedIndex(ids: string[]) {
  localStorage.setItem(
    'futureme-profiles-index',
    JSON.stringify(ids.map((id) => ({ id, preview: 'p', updatedAt: 1 }))),
  )
}

describe('mergeProfilePhotos', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('원격만 있으면 로컬에 내려받는다', () => {
    seedIndex([])
    mergeProfilePhotos([
      {
        profile_id: PROFILE_A,
        photos: { presentDataUrl: 'data:image/jpeg;base64,abc', updatedAt: 100 },
        updated_at: 100,
      },
    ])
    expect(loadProfilePhotos(PROFILE_A).presentDataUrl).toBe('data:image/jpeg;base64,abc')
  })

  test('로컬이 더 최신이면 원격을 덮어쓰지 않는다', () => {
    seedIndex([PROFILE_A])
    saveProfilePhotosLocal(PROFILE_A, {
      presentDataUrl: 'data:image/jpeg;base64,local',
      updatedAt: 200,
    } satisfies ProfilePhotos)

    mergeProfilePhotos([
      {
        profile_id: PROFILE_A,
        photos: { presentDataUrl: 'data:image/jpeg;base64,remote', updatedAt: 50 },
        updated_at: 50,
      },
    ])

    expect(loadProfilePhotos(PROFILE_A).presentDataUrl).toBe('data:image/jpeg;base64,local')
  })

  test('원격이 더 최신이면 로컬을 갱신한다', () => {
    seedIndex([PROFILE_A])
    saveProfilePhotosLocal(PROFILE_A, {
      presentDataUrl: 'data:image/jpeg;base64,old',
      updatedAt: 10,
    })

    mergeProfilePhotos([
      {
        profile_id: PROFILE_A,
        photos: {
          presentDataUrl: 'data:image/jpeg;base64,new',
          futureVisionDataUrl: 'data:image/jpeg;base64,future',
          updatedAt: 500,
        },
        updated_at: 500,
      },
    ])

    const photos = loadProfilePhotos(PROFILE_A)
    expect(photos.presentDataUrl).toBe('data:image/jpeg;base64,new')
    expect(photos.futureVisionDataUrl).toBe('data:image/jpeg;base64,future')
  })

  test('로컬만 있는 프로필은 병합 후에도 유지된다', () => {
    seedIndex([PROFILE_B])
    saveProfilePhotosLocal(PROFILE_B, {
      presentDataUrl: 'data:image/jpeg;base64,only-local',
      updatedAt: 300,
    })

    mergeProfilePhotos([
      {
        profile_id: PROFILE_A,
        photos: { presentDataUrl: 'data:image/jpeg;base64,remote-a', updatedAt: 100 },
        updated_at: 100,
      },
    ])

    expect(loadProfilePhotos(PROFILE_B).presentDataUrl).toBe('data:image/jpeg;base64,only-local')
    expect(loadProfilePhotos(PROFILE_A).presentDataUrl).toBe('data:image/jpeg;base64,remote-a')
  })
})

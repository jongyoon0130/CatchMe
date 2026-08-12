import { useEffect, useRef, useState } from 'react'
import type { SelfProfile } from '../../types/self'
import { FUTURE_YEARS_AHEAD } from '../../lib/brand'
import { generateFutureVisionImage, hasFutureVisionSource } from '../../lib/futureVisionEngine'
import {
  fileToPortraitDataUrl,
  loadProfilePhotos,
  saveProfilePhotos,
  PROFILE_PHOTOS_SYNC_EVENT,
  type ProfilePhotos,
} from '../../lib/profilePhotos'
import { resolveEffectiveApiKey } from '../../lib/geminiApiKey'
import { geminiErrorUserMessage } from '../../lib/selfEngine'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  profile: SelfProfile
}

export function ProfileFutureVision({ profile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { syncing, lastSync } = useAuth()
  const [photos, setPhotos] = useState<ProfilePhotos>(() => loadProfilePhotos(profile.id))
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reloadPhotos = () => setPhotos(loadProfilePhotos(profile.id))

  useEffect(() => {
    reloadPhotos()
  }, [profile.id])

  useEffect(() => {
    if (!syncing && lastSync) reloadPhotos()
  }, [syncing, lastSync, profile.id])

  useEffect(() => {
    const onSynced = () => reloadPhotos()
    window.addEventListener(PROFILE_PHOTOS_SYNC_EVENT, onSynced)
    return () => window.removeEventListener(PROFILE_PHOTOS_SYNC_EVENT, onSynced)
  }, [profile.id])

  const persist = (next: ProfilePhotos) => {
    setPhotos(next)
    saveProfilePhotos(profile.id, next)
  }

  const onPickFile = async (file: File | null) => {
    if (!file) return
    setError(null)
    try {
      const dataUrl = await fileToPortraitDataUrl(file)
      persist({ ...photos, presentDataUrl: dataUrl })
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 올리지 못했어요.')
    }
  }

  // 일 한도 1회 — 마지막 생성이 오늘이면 내일까지 잠금
  const generatedToday = (() => {
    const at = photos.futureVisionGeneratedAt
    if (!at) return false
    return new Date(at).toDateString() === new Date().toDateString()
  })()

  const onGenerate = async () => {
    const key = resolveEffectiveApiKey()
    if (!key) {
      setError('AI 연결을 사용할 수 없어요. 잠시 후 다시 시도해주세요.')
      return
    }
    if (generatedToday) {
      setError('AI 사진은 하루에 1번만 만들 수 있어요. 내일 다시 시도해주세요.')
      return
    }
    if (!photos.presentDataUrl) {
      setError('사진을 먼저 올려주세요.')
      return
    }
    if (!hasFutureVisionSource(profile)) {
      setError('프로필(정체성·하루 등)을 먼저 채워주세요.')
      return
    }

    setGenerating(true)
    setError(null)
    try {
      const result = await generateFutureVisionImage(key, profile, photos.presentDataUrl)
      persist({
        ...photos,
        futureVisionDataUrl: result.dataUrl,
        futureVisionGeneratedAt: Date.now(),
      })
    } catch (e) {
      setError(geminiErrorUserMessage(e))
    } finally {
      setGenerating(false)
    }
  }

  const openPicker = () => inputRef.current?.click()

  return (
    <section className="space-y-4">
      <header className="px-0.5">
        <h3 className="text-[22px] font-extrabold tracking-[-0.03em] text-ink leading-tight">미래 카메라</h3>
        <p className="text-[12px] text-muted mt-1">AI 에이징 · {FUTURE_YEARS_AHEAD}년 뒤 모습</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={openPicker}
            className="nb-card nb-card-interactive relative aspect-[3/4] rounded-[20px] overflow-hidden text-left active:scale-100"
          >
            <span className="nb-pill absolute top-2.5 left-2.5 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold">
              현재
            </span>
            {photos.presentDataUrl ? (
              <img src={photos.presentDataUrl} alt="현재" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3">
                <span className="nb-icon flex h-14 w-14 items-center justify-center rounded-full text-muted">
                  <CameraIcon />
                </span>
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={openPicker}
            className="nb-pill w-full rounded-full py-2 text-center text-[11px] font-bold"
          >
            {photos.presentDataUrl ? '사진 바꾸기' : '사진 업로드'}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="nb-card nb-card--mint relative aspect-[3/4] rounded-[20px] overflow-hidden">
            <span className="nb-pill absolute top-2.5 left-2.5 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold bg-surface">
              {FUTURE_YEARS_AHEAD}년 뒤
            </span>
            {photos.futureVisionDataUrl ? (
              <img
                src={photos.futureVisionDataUrl}
                alt={`${FUTURE_YEARS_AHEAD}년 뒤`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
                <div className="nb-icon relative flex h-[72%] max-h-[140px] w-[72%] max-w-[140px] items-center justify-center rounded-full bg-surface">
                  {generating ? (
                    <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  ) : (
                    <SparkIcon />
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={generating || !photos.presentDataUrl || generatedToday}
            className="nb-pill w-full rounded-full py-2 text-center text-[11px] font-bold bg-surface disabled:opacity-60"
          >
            {generating ? '그리는 중…' : generatedToday ? '오늘은 완료 (하루 1회)' : '미래 확인하기'}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void onPickFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />

      {error ? <p className="text-[11px] text-status-error leading-relaxed px-0.5">{error}</p> : null}
    </section>
  )
}

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8h3.5L9 5h6l1.5 3H20a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2v-9a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden className="text-ink/70">
      <path
        d="M12 3l1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M18 16l.8 2.6L21.4 19l-2.6.8L18 22l-.8-2.6L14.6 19l2.6-.8L18 16z" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

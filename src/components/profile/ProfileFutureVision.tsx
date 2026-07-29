import { useRef, useState } from 'react'
import type { SelfProfile } from '../../types/self'
import { FUTURE_YEARS_AHEAD } from '../../lib/brand'
import { generateFutureVisionImage, hasFutureVisionSource } from '../../lib/futureVisionEngine'
import {
  fileToPortraitDataUrl,
  loadProfilePhotos,
  saveProfilePhotos,
  type ProfilePhotos,
} from '../../lib/profilePhotos'
import { loadApiKey } from '../../lib/storage'
import { geminiErrorUserMessage } from '../../lib/selfEngine'

interface Props {
  profile: SelfProfile
}

export function ProfileFutureVision({ profile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<ProfilePhotos>(() => loadProfilePhotos(profile.id))
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const onGenerate = async () => {
    const key = loadApiKey()?.trim()
    if (!key) {
      setError('채팅 탭 ⚙️에서 Gemini API 키를 먼저 설정해주세요.')
      return
    }
    if (!photos.presentDataUrl) {
      setError('지금 사진을 먼저 올려주세요.')
      return
    }
    if (!hasFutureVisionSource(profile)) {
      setError('미래의 나 프로필(정체성·하루 등)을 먼저 채워주세요.')
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

  const clearPresent = () => {
    persist({
      futureVisionDataUrl: photos.futureVisionDataUrl,
      futureVisionGeneratedAt: photos.futureVisionGeneratedAt,
    })
  }

  const clearFuture = () => {
    persist({
      presentDataUrl: photos.presentDataUrl,
    })
  }

  return (
    <section className="space-y-3">
      <div className="px-0.5">
        <h3 className="text-[11px] font-bold text-muted/70 uppercase tracking-[0.1em]">미래 비전</h3>
        <p className="text-[11px] text-muted mt-1 leading-relaxed">
          지금 사진을 올리면, 설정해 둔 {FUTURE_YEARS_AHEAD}년 뒤의 나를 담은 모습으로 바꿔줘요.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <PhotoSlot
          label="지금"
          dataUrl={photos.presentDataUrl}
          emptyHint="사진 올리기"
          onClick={() => inputRef.current?.click()}
        />
        <PhotoSlot
          label={`${FUTURE_YEARS_AHEAD}년 뒤`}
          dataUrl={photos.futureVisionDataUrl}
          emptyHint="아래 버튼으로 생성"
          tone="future"
        />
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-full border-2 border-border bg-surface px-4 py-2 text-xs font-bold text-ink active:scale-[0.98]"
        >
          {photos.presentDataUrl ? '사진 바꾸기' : '내 사진 올리기'}
        </button>
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={generating || !photos.presentDataUrl}
          className="rounded-full border-2 border-border bg-accent/40 px-4 py-2 text-xs font-bold text-ink disabled:opacity-45 active:scale-[0.98]"
        >
          {generating ? '그리는 중…' : '미래의 나 그리기'}
        </button>
        {photos.presentDataUrl ? (
          <button type="button" onClick={clearPresent} className="text-[11px] text-muted px-2 py-2">
            지금 사진 지우기
          </button>
        ) : null}
        {photos.futureVisionDataUrl ? (
          <button type="button" onClick={clearFuture} className="text-[11px] text-muted px-2 py-2">
            미래 사진 지우기
          </button>
        ) : null}
      </div>

      {generating ? (
        <p className="text-[11px] text-muted px-0.5">30초~2분 정도 걸릴 수 있어요. 잠깐만 기다려줘.</p>
      ) : null}

      {error ? <p className="text-[11px] text-status-error leading-relaxed px-0.5">{error}</p> : null}

      <p className="text-[10px] text-muted/70 leading-relaxed px-0.5">
        AI가 상상한 이미지예요. 실제 {FUTURE_YEARS_AHEAD}년 후 모습과 다를 수 있고, 사진은 이 기기에만
        저장돼요.
      </p>
    </section>
  )
}

function PhotoSlot({
  label,
  dataUrl,
  emptyHint,
  tone,
  onClick,
}: {
  label: string
  dataUrl?: string
  emptyHint: string
  tone?: 'future'
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative aspect-[3/4] rounded-[20px] border-2 border-border overflow-hidden flex flex-col ${
        tone === 'future' ? 'bg-accent/20' : 'bg-surface-2'
      } ${onClick ? 'active:scale-[0.99] cursor-pointer' : ''}`}
    >
      <span className="absolute top-2 left-2 z-10 text-[10px] font-bold uppercase tracking-wider text-ink/80 bg-surface/80 border border-border/60 rounded-full px-2 py-0.5">
        {label}
      </span>
      {dataUrl ? (
        <img src={dataUrl} alt={label} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="flex-1 flex items-center justify-center px-3">
          <p className="text-[11px] text-muted text-center leading-snug">{emptyHint}</p>
        </div>
      )}
    </Tag>
  )
}

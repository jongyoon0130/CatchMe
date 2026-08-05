import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { normalizeDismissPhrase, saveManualDismissPhrase } from '../../lib/alarmDismissPhrase'
import { generateDismissPhraseWithAI } from '../../lib/alarmDismissPhraseEngine'

interface Props {
  alarmId: string
  dateKey: string
  alarmLabel: string
  initialPhrase: string
  onSaved: () => void
  onClose: () => void
}

export function DismissPhraseEditSheet({
  alarmId,
  dateKey,
  alarmLabel,
  initialPhrase,
  onSaved,
  onClose,
}: Props) {
  useBodyScrollLock(true)

  const [phrase, setPhrase] = useState(initialPhrase)
  const [busy, setBusy] = useState<'ai' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPhrase(initialPhrase)
  }, [initialPhrase])

  const handleSaveManual = () => {
    const normalized = normalizeDismissPhrase(phrase)
    const lineCount = normalized.split('\n').filter(Boolean).length
    if (!normalized.trim()) {
      setError('다짐을 입력해주세요.')
      return
    }
    if (lineCount > 4) {
      setError('다짐은 최대 4줄까지예요.')
      return
    }
    saveManualDismissPhrase({ alarmId, dateKey, phrase: normalized })
    onSaved()
    onClose()
  }

  const handleGenerateAI = async () => {
    setBusy('ai')
    setError(null)
    try {
      const record = await generateDismissPhraseWithAI({
        alarmId,
        dateKey,
        alarmLabel,
        force: true,
      })
      setPhrase(record.phrase)
      onSaved()
    } catch {
      setError('AI 생성에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setBusy(null)
    }
  }

  const sheet = (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center overscroll-none touch-none"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-ink/30" aria-hidden />

      <div
        className="relative z-10 flex w-full max-w-lg max-h-[92vh] flex-col rounded-t-[28px] bg-surface shadow-[0_-12px_40px_rgba(20,22,28,0.12)] animate-fade-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="다짐 편집"
      >
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border/40">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <button type="button" onClick={onClose} className="text-sm text-muted px-1 py-1">
              취소
            </button>
            <h2 className="text-[15px] font-bold text-ink">다짐 편집</h2>
            <button
              type="button"
              onClick={handleSaveManual}
              disabled={busy !== null}
              className="text-sm font-bold text-ink px-1 py-1 disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-5 py-4 pb-8">
          <p className="text-[11px] text-muted leading-relaxed mb-4">
            알람을 끄려면 이 문장을 그대로 따라 쳐야 해요. 직접 쓰거나 AI로 생성할 수 있어요.
          </p>

          <label className="text-[11px] text-muted mb-1.5 block">직접 편집</label>
          <textarea
            value={phrase}
            onChange={(e) => {
              setPhrase(e.target.value)
              setError(null)
            }}
            rows={5}
            placeholder={'나는 오늘도\n한 걸음\n내딛겠다'}
            className="w-full resize-none rounded-xl border border-border bg-surface-2/50 px-3.5 py-3 font-serif text-[15px] leading-relaxed text-ink focus:outline-none focus:border-ink/30"
          />
          <p className="text-[10px] text-muted/80 mt-1.5">3~4줄 권장 · 줄바꿈으로 구분</p>

          {error ? <p className="text-[11px] text-status-error mt-2">{error}</p> : null}

          <div className="mt-5 pt-5 border-t border-border/40">
            <p className="text-[11px] text-muted mb-2">목표·미래의 나 정보를 바탕으로 AI가 다짐을 만들어요</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleGenerateAI()}
              className="w-full rounded-xl bg-ink py-3 text-sm font-bold text-surface disabled:opacity-50"
            >
              {busy === 'ai' ? 'AI 생성 중…' : 'AI로 생성'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}

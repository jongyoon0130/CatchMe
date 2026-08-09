import { useState } from 'react'
import { Button } from '../ui'
import { formatChatTime } from '../../lib/chatDisplay'
import type { ApiCheckResult } from '../../lib/selfEngine'
import { getActiveModel, verifyApiKey } from '../../lib/selfEngine'
import {
  clearApiCheckCache,
  loadApiCheckCache,
  loadApiKey,
  loadModel,
  resolveCachedApiStatus,
  saveApiCheckCache,
  saveApiKey,
  saveModel,
} from '../../lib/storage'

function readInitialApiStatus(): 'idle' | ApiCheckResult {
  const key = loadApiKey()?.trim() ?? ''
  const mdl = getActiveModel(loadModel())
  const cached = resolveCachedApiStatus(key, mdl)
  return cached === 'idle' ? 'idle' : cached
}

function maskApiKeyDisplay(key: string): string {
  if (!key) return ''
  if (key.length <= 4) return '•'.repeat(key.length)
  return `···${key.slice(-4)}`
}

export function ChatApiSettingsSection({ onChanged }: { onChanged?: () => void }) {
  const [apiKey, setApiKey] = useState(loadApiKey() ?? '')
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | ApiCheckResult>(readInitialApiStatus)
  const [apiCheckedAt, setApiCheckedAt] = useState<number | null>(() => {
    const key = loadApiKey()?.trim() ?? ''
    const mdl = getActiveModel(loadModel())
    if (resolveCachedApiStatus(key, mdl) === 'idle') return null
    return loadApiCheckCache()?.checkedAt ?? null
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyFocused, setApiKeyFocused] = useState(false)
  const apiKeyRevealed = showApiKey || apiKeyFocused

  const saveAndVerify = async () => {
    const key = apiKey.trim()
    const resolved = getActiveModel()
    saveApiKey(key)
    saveModel(resolved)
    if (!key) {
      clearApiCheckCache()
      setApiStatus('idle')
      setApiCheckedAt(null)
      onChanged?.()
      return
    }
    setApiStatus('testing')
    const result = await verifyApiKey(key, resolved)
    setApiStatus(result)
    saveApiCheckCache(result, key, resolved)
    setApiCheckedAt(Date.now())
    onChanged?.()
  }

  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/30 px-3.5 py-3.5">
      <p className="text-[13px] font-semibold text-ink mb-1">Gemini API Key</p>
      <p className="text-[11px] text-muted/80 mb-3 leading-relaxed">
        무료 · 없으면 로컬 엔진 사용 ·{' '}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-ink/80 underline underline-offset-2"
        >
          aistudio.google.com/apikey
        </a>
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={apiKeyRevealed ? apiKey : maskApiKeyDisplay(apiKey)}
            readOnly={!apiKeyRevealed}
            onFocus={() => setApiKeyFocused(true)}
            onBlur={() => {
              setApiKeyFocused(false)
              setShowApiKey(false)
            }}
            onChange={(e) => {
              setApiKey(e.target.value)
              setApiStatus('idle')
              setApiCheckedAt(null)
            }}
            placeholder="AIza..."
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-3 pr-9 py-2 rounded-lg bg-surface border border-border text-sm font-mono focus:outline-none focus:border-accent"
          />
          {apiKey.length > 0 ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-ink transition-colors"
              title={showApiKey ? '키 숨기기' : '키 보기'}
              aria-label={showApiKey ? 'API 키 숨기기' : 'API 키 보기'}
            >
              {showApiKey ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-4-11-4a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 4 11 4a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <path d="m1 1 22 22" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          ) : null}
        </div>
        <Button size="sm" onClick={() => void saveAndVerify()} disabled={apiStatus === 'testing'}>
          {apiStatus === 'testing' ? '확인 중…' : '저장'}
        </Button>
      </div>
      {apiStatus !== 'idle' ? (
        <div className="mt-2.5 text-xs flex items-center gap-1.5">
          {apiStatus === 'testing' ? (
            <span className="text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
              연결 확인 중…
            </span>
          ) : null}
          {apiStatus === 'ok' ? (
            <span className="text-status-ok flex items-center gap-1.5 flex-wrap">
              <span className="w-1.5 h-1.5 rounded-full bg-status-ok shrink-0" />
              <span>
                ✓ 정상 호출 — AI가 응답합니다
                {apiCheckedAt ? (
                  <span className="text-muted/60 font-normal">
                    {' '}
                    · {formatChatTime(apiCheckedAt)} 확인
                  </span>
                ) : null}
              </span>
            </span>
          ) : null}
          {apiStatus === 'bad_key' ? (
            <span className="text-status-error flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-status-error" />
              ✕ 키가 올바르지 않아요 — 다시 확인해주세요
            </span>
          ) : null}
          {apiStatus === 'rate_limit' ? (
            <span className="text-status-warn flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-status-warn" />
              ⚠ API 한도 초과 — 1~2분 후 재시도
            </span>
          ) : null}
          {apiStatus === 'error' ? (
            <span className="text-status-warn flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-status-warn" />
              ⚠ 연결에 실패했어요 — 네트워크를 확인해주세요
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

import { useState } from 'react'
import { Button } from '../ui'
import { formatChatTime } from '../../lib/chatDisplay'
import {
  getBuiltInGeminiApiKey,
  hasBuiltInGeminiApiKey,
  isUsingBuiltInApiKey,
  maskApiKeyTail,
  resolveEffectiveApiKey,
} from '../../lib/geminiApiKey'
import type { ApiCheckResult } from '../../lib/selfEngine'
import { getActiveModel, verifyApiKey } from '../../lib/selfEngine'
import {
  clearApiCheckCache,
  loadApiCheckCache,
  loadStoredApiKey,
  loadModel,
  resolveCachedApiStatus,
  saveApiCheckCache,
  saveApiKey,
  saveModel,
} from '../../lib/storage'

function readInitialApiStatus(): 'idle' | ApiCheckResult {
  const key = resolveEffectiveApiKey()
  const mdl = getActiveModel(loadModel())
  const cached = resolveCachedApiStatus(key, mdl)
  return cached === 'idle' ? 'idle' : cached
}

export function ChatApiSettingsSection({ onChanged }: { onChanged?: () => void }) {
  const [apiKey, setApiKey] = useState(loadStoredApiKey() ?? '')
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | ApiCheckResult>(readInitialApiStatus)
  const [apiCheckedAt, setApiCheckedAt] = useState<number | null>(() => {
    const key = resolveEffectiveApiKey()
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
    const effective = key || getBuiltInGeminiApiKey()
    if (!effective) {
      clearApiCheckCache()
      setApiStatus('idle')
      setApiCheckedAt(null)
      onChanged?.()
      return
    }
    setApiStatus('testing')
    const result = await verifyApiKey(effective, resolved)
    setApiStatus(result)
    saveApiCheckCache(result, effective, resolved)
    setApiCheckedAt(Date.now())
    onChanged?.()
  }

  const clearOverride = () => {
    setApiKey('')
    saveApiKey('')
    clearApiCheckCache()
    setApiStatus('idle')
    setApiCheckedAt(null)
    onChanged?.()
  }

  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/30 px-3.5 py-3.5">
      <p className="text-[13px] font-semibold text-ink mb-1">Gemini API Key</p>
      <p className="text-[11px] text-muted/80 mb-3 leading-relaxed">
        개발자 전용 · 비워두면 앱 내장 키 사용
      </p>

      {isUsingBuiltInApiKey() ? (
        <p className="text-[11px] text-status-ok mb-3">
          내장 키 사용 중 ({maskApiKeyTail(getBuiltInGeminiApiKey())})
        </p>
      ) : null}

      {!hasBuiltInGeminiApiKey() && !apiKey.trim() ? (
        <p className="text-[11px] text-status-warn mb-3">
          빌드에 VITE_GEMINI_API_KEY가 없어요 — 키를 입력하거나 .env에 설정하세요.
        </p>
      ) : null}

      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={apiKeyRevealed ? apiKey : maskApiKeyTail(apiKey)}
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
            placeholder={hasBuiltInGeminiApiKey() ? '비우면 내장 키' : 'AIza...'}
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

      {apiKey.trim() && hasBuiltInGeminiApiKey() ? (
        <button
          type="button"
          onClick={clearOverride}
          className="mt-2 text-[11px] text-muted underline underline-offset-2"
        >
          사용자 키 지우고 내장 키로 되돌리기
        </button>
      ) : null}

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

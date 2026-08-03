import { useState } from 'react'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { FutureMeLogo } from '../brand/FutureMeLogo'
import { useAuth } from '../../contexts/AuthContext'
import { hasLocalData } from '../../lib/syncOrchestrator'

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}

export function AuthScreen() {
  const { signInWithApple, signInWithGoogle, syncing } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'apple' | 'google' | null>(null)

  const handleApple = async () => {
    setError(null)
    setPending('apple')
    try {
      await signInWithApple()
    } catch {
      setError('Apple 로그인에 실패했어요. 다시 시도해주세요.')
    } finally {
      setPending(null)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setPending('google')
    try {
      await signInWithGoogle()
    } catch {
      setError('구글 로그인에 실패했어요. 다시 시도해주세요.')
      setPending(null)
    }
  }

  const localHint = hasLocalData()
  const busy = pending !== null || syncing

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 bg-void">
      <div className="w-full max-w-sm text-center">
        <FutureMeLogo size={72} className="mx-auto mb-6" />
        <h1 className="text-xl font-medium text-ink mb-2">{APP_NAME}</h1>
        <p className="text-sm text-muted mb-8 leading-relaxed">{APP_TAGLINE}</p>

        {localHint && (
          <p className="text-xs text-muted/90 mb-4 leading-relaxed px-2">
            이 기기에 저장된 프로필·채팅이 있어요.
            <br />
            로그인하면 계정에 올려 다른 기기에서도 쓸 수 있어요.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleApple()}
            className="w-full py-3.5 px-4 rounded-2xl bg-black text-white font-medium hover:bg-black/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <AppleLogo className="w-5 h-5" />
            {pending === 'apple' ? '연결 중…' : 'Apple로 계속하기'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGoogle()}
            className="w-full py-3.5 px-4 rounded-2xl bg-surface border border-border text-ink font-medium hover:border-accent/40 hover:bg-accent/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="text-lg" aria-hidden>
              G
            </span>
            {pending === 'google' ? '연결 중…' : 'Google로 계속하기'}
          </button>
        </div>

        {error && <p className="text-xs text-status-error mt-3">{error}</p>}

        <p className="text-[11px] text-muted/60 mt-6 leading-relaxed">
          로그인하면 프로필·채팅이 클라우드에 저장돼요.
          <br />
          Gemini API 키는 로그인한 계정에 동기화돼요.
        </p>
        <p className="text-[11px] text-muted/60 mt-3">
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted"
          >
            개인정보 처리방침
          </a>
        </p>
      </div>
    </div>
  )
}

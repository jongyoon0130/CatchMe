import { useState } from 'react'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { FutureMeLogo } from '../brand/FutureMeLogo'
import { useAuth } from '../../contexts/AuthContext'
import { hasLocalData } from '../../lib/syncOrchestrator'

export function AuthScreen() {
  const { signInWithGoogle, syncing } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleGoogle = async () => {
    setError(null)
    setPending(true)
    try {
      await signInWithGoogle()
    } catch {
      setError('구글 로그인에 실패했어요. 다시 시도해주세요.')
      setPending(false)
    }
  }

  const localHint = hasLocalData()

  return (
    <div className="h-full flex flex-col items-center justify-center px-7 bg-void">
      <div className="w-full max-w-[20rem] text-center animate-fade-up">
        <div className="relative mx-auto mb-8 w-fit">
          <div
            className="absolute -inset-8 rounded-full blur-2xl opacity-45"
            style={{ background: 'radial-gradient(circle, #f5c542 0%, transparent 68%)' }}
            aria-hidden
          />
          <FutureMeLogo size={80} className="relative" />
        </div>
        <h1 className="text-[27px] font-extrabold tracking-[-0.035em] text-ink mb-2.5">{APP_NAME}</h1>
        <p className="text-[15px] font-medium text-ink/70 mb-9 leading-relaxed">{APP_TAGLINE}</p>

        {localHint && (
          <p className="text-xs text-muted mb-4 leading-relaxed px-2">
            이 기기에 저장된 프로필·채팅이 있어요.
            <br />
            로그인하면 계정에 올려 다른 기기에서도 쓸 수 있어요.
          </p>
        )}

        <button
          type="button"
          disabled={pending || syncing}
          onClick={() => void handleGoogle()}
          className="flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-4 py-4 font-bold text-surface shadow-[0_6px_20px_rgba(20,22,28,0.24)] transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          <span className="text-lg leading-none" aria-hidden>
            G
          </span>
          {pending || syncing ? '연결 중…' : 'Google로 계속하기'}
        </button>

        {error && <p className="text-xs text-status-error mt-3">{error}</p>}

        <p className="text-[11.5px] text-muted/70 mt-7 leading-relaxed">
          로그인하면 프로필·채팅이 클라우드에 저장돼요.
          <br />
          Gemini API 키는 이 기기에만 남아요.
        </p>
      </div>
    </div>
  )
}

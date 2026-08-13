// 유저에게 보이는 AI 상태 한 줄. 키 이야기는 하지 않는다 —
// 유저는 키를 발급받거나 넣을 일이 없고, "지금 되는지"만 알면 된다.
// (키 입력란은 개발자 모드에서만 나온다: ChatApiSettingsSection)
//
// 판단은 canUseAi()에 맡긴다. 실제로 AI를 부르는 코드와 **같은 근거**를 봐야
// 화면이 거짓말을 하지 않는다 — 예전에 React의 세션 상태를 보다가
// "채팅은 되는데 설정에는 안 된다고 뜨는" 일이 있었다.
import { useEffect, useState } from 'react'
import { canUseAi } from '../../lib/geminiApiKey'
import { useAuth } from '../../contexts/AuthContext'

export function AiStatusRow() {
  const { configured, session } = useAuth()
  const [ready, setReady] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void canUseAi().then((v) => {
      if (!cancelled) setReady(v)
    })
    return () => {
      cancelled = true
    }
    // 로그인·로그아웃하면 다시 본다
  }, [session])

  const dot = ready === null ? 'bg-muted' : ready ? 'bg-status-ok' : 'bg-status-warn'

  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/30 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <p className="text-[13px] font-semibold text-ink">
          {ready === null ? '확인 중…' : ready ? 'AI 연결됨' : 'AI를 쓸 수 없어요'}
        </p>
      </div>
      {ready !== null ? (
        <p className="text-[11px] text-muted/80 mt-1 leading-relaxed">
          {ready
            ? '5년 뒤의 나와 바로 대화할 수 있어요.'
            : configured && !session
              ? '로그인하면 바로 대화할 수 있어요.'
              : '연결이 준비되지 않았어요. 잠시 뒤 다시 확인해주세요.'}
        </p>
      ) : null}
    </div>
  )
}

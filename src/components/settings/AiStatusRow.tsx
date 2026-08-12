// 유저에게 보이는 AI 상태 한 줄. 키 이야기는 하지 않는다 —
// 유저는 키를 발급받거나 넣을 일이 없고, "지금 되는지"만 알면 된다.
// (키 입력란은 개발자 모드에서만 나온다: ChatApiSettingsSection)
import { hasEffectiveApiKey, isUsingAiProxy } from '../../lib/geminiApiKey'
import { useAuth } from '../../contexts/AuthContext'

export function AiStatusRow() {
  const { configured, session } = useAuth()

  // 프록시는 로그인해야 쓴다. 로그인 전에는 "왜 안 되는지"를 먼저 알려준다.
  const proxyReady = isUsingAiProxy() && Boolean(session)
  const ready = proxyReady || (hasEffectiveApiKey() && !isUsingAiProxy())

  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/30 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${ready ? 'bg-status-ok' : 'bg-status-warn'}`}
        />
        <p className="text-[13px] font-semibold text-ink">
          {ready ? 'AI 연결됨' : 'AI를 쓸 수 없어요'}
        </p>
      </div>
      <p className="text-[11px] text-muted/80 mt-1 leading-relaxed">
        {ready
          ? '5년 뒤의 나와 바로 대화할 수 있어요.'
          : configured && !session
            ? '로그인하면 바로 대화할 수 있어요.'
            : '연결이 준비되지 않았어요. 잠시 뒤 다시 확인해주세요.'}
      </p>
    </div>
  )
}

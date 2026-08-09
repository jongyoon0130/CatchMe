import { useState } from 'react'
import { deleteAccountWithConfirm } from '../../lib/accountActions'
import { useAuth } from '../../contexts/AuthContext'

export function AccountSettingsSection() {
  const { configured, user, signOut, uploadLocalData, syncing, lastSync } = useAuth()
  const [deleting, setDeleting] = useState(false)

  if (!configured) return null

  const syncLabel =
    lastSync?.mode === 'uploaded'
      ? '클라우드에 올림'
      : lastSync?.mode === 'downloaded'
        ? '클라우드에서 받음'
        : lastSync?.mode === 'merged'
          ? '동기화됨'
          : null

  const handleUpload = async () => {
    const result = await uploadLocalData()
    if (result && result.count > 0) {
      window.alert(`${result.count}개 프로필을 클라우드에 올렸어요.`)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    const ok = await deleteAccountWithConfirm()
    if (!ok) setDeleting(false)
  }

  return (
    <section className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">계정</p>

      {!user ? (
        <p className="text-[11px] text-muted/80 leading-relaxed">
          로그인하면 클라우드 동기화·로그아웃·계정 삭제를 여기서 관리할 수 있어요.
        </p>
      ) : (
        <>
          <div className="nb-card rounded-2xl overflow-hidden mb-3">
            <div className="flex items-center gap-3 px-3.5 py-3 border-b border-border/40">
              <div className="w-10 h-10 rounded-xl border border-border bg-surface-2 flex items-center justify-center text-sm font-bold text-ink overflow-hidden shrink-0">
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url as string}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (user.email?.[0] ?? '?').toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-ink truncate">{user.email ?? '로그인됨'}</p>
                {syncLabel ? <p className="text-[11px] text-accent mt-0.5">{syncLabel}</p> : null}
              </div>
            </div>

            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleUpload()}
              className="w-full text-left px-3.5 py-3 text-[13px] text-ink border-b border-border/40 hover:bg-ink/[0.03] disabled:opacity-50"
            >
              {syncing ? '동기화 중…' : '클라우드에 올리기'}
            </button>

            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full text-left px-3.5 py-3 text-[13px] text-muted border-b border-border/40 hover:bg-ink/[0.03]"
            >
              로그아웃
            </button>

            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-3.5 py-3 text-[13px] text-ink border-b border-border/40 hover:bg-ink/[0.03]"
            >
              개인정보 처리방침
            </a>

            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleDeleteAccount()}
              className="w-full text-left px-3.5 py-3 text-[13px] text-status-error hover:bg-status-error/[0.06] disabled:opacity-50"
            >
              {deleting ? '삭제 중…' : '계정 삭제'}
            </button>
          </div>

          <p className="text-[11px] text-muted/60 leading-relaxed px-0.5">
            로그아웃은 데이터를 지우지 않아요. 계정 삭제는 모든 데이터가 영구히 사라지고 되돌릴 수 없어요.
            다른 계정으로 로그인하면 그 계정의 클라우드 데이터를 불러와요.
          </p>
        </>
      )}
    </section>
  )
}

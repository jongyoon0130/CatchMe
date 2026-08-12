import { useState } from 'react'
import { deleteAccountWithConfirm } from '../../lib/accountActions'
import { useAuth } from '../../contexts/AuthContext'

export function AccountMenuButton() {
  const { configured, user, signOut, uploadLocalData, syncing, lastSync } = useAuth()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!configured || !user) return null

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
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-surface-2 text-xs font-medium text-ink hover:border-accent/40 hover:bg-accent/5 transition-colors overflow-hidden"
        title={user.email ?? '계정'}
        aria-label="계정 메뉴"
      >
        {user.user_metadata?.avatar_url ? (
          <img src={user.user_metadata.avatar_url as string} alt="" className="w-full h-full object-cover" />
        ) : (
          (user.email?.[0] ?? 'G').toUpperCase()
        )}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-xl border border-border bg-surface shadow-lg py-1 text-sm">
            <p className="px-3 py-2 text-[11px] text-muted truncate border-b border-border/60">{user.email}</p>
            {syncLabel ? <p className="px-3 py-1.5 text-[11px] text-accent">{syncLabel}</p> : null}
            <button
              type="button"
              disabled={syncing}
              onClick={() => {
                setOpen(false)
                void handleUpload()
              }}
              className="w-full text-left px-3 py-2 text-ink hover:bg-ink/[0.04] disabled:opacity-50"
            >
              {syncing ? '동기화 중…' : '클라우드에 올리기'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                void signOut()
              }}
              className="w-full text-left px-3 py-2 text-muted hover:bg-ink/[0.04]"
            >
              로그아웃
            </button>
            <div className="border-t border-border/60 mt-1 pt-1">
              <a
                href="/privacy.html"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="block w-full px-3 py-2 text-[11px] text-muted hover:bg-ink/[0.04]"
              >
                개인정보 처리방침
              </a>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setOpen(false)
                  void handleDeleteAccount()
                }}
                className="w-full text-left px-3 py-2 text-status-error hover:bg-status-error/[0.06] disabled:opacity-50"
              >
                {deleting ? '삭제 중…' : '계정 삭제'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

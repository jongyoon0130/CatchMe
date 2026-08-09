import { deleteAccountInCloud } from './cloudSync'
import { clearLastAuthUserId } from './localAccountScope'
import { supabase } from './supabase'

const CONFIRM_MSG =
  '계정을 삭제할까요?\n\n' +
  '프로필·대화·목표·할 일 등 모든 데이터와 로그인 계정이 영구히 지워지고, 되돌릴 수 없어요.\n\n' +
  '(잠시 쉬었다 다시 쓰고 싶다면 삭제 대신 "로그아웃"을 쓰세요 — 데이터가 그대로 남아요.)'

/**
 * 계정 삭제: 확인 → 서버가 로그인 계정과 모든 데이터를 지움 → 로컬 비우고 새로고침.
 * 취소하거나 실패하면 false를 돌려준다(호출부가 "삭제 중" 표시를 되돌리도록).
 * 성공 시엔 새로고침되므로 사실상 반환값이 쓰이지 않는다.
 *
 * 프로필 목록·프로필 탭 두 곳에서 같은 흐름을 쓰기 위해 여기로 모았다.
 */
export async function deleteAccountWithConfirm(): Promise<boolean> {
  if (!window.confirm(CONFIRM_MSG)) return false
  try {
    await deleteAccountInCloud()
    if (supabase) await supabase.auth.signOut({ scope: 'global' })
    clearLastAuthUserId()
    localStorage.clear()
    sessionStorage.clear()
    window.location.reload()
    return true
  } catch {
    window.alert('계정 삭제에 실패했어요. 잠시 후 다시 시도하거나 문의해 주세요.')
    return false
  }
}

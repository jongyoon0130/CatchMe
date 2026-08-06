import { useEffect } from 'react'

/**
 * 모달·시트 열릴 때 뒤 배경 스크롤 잠금 (iOS PWA).
 *
 * 주의: body를 position:fixed로 만들고 닫을 때 scrollTo로 되돌리는 방식은
 * 시트가 닫히는 순간 화면이 살짝 튀는(위/아래로 밀리는) 원인이었다.
 * 이 앱은 스크롤이 전부 내부 컨테이너에서 일어나므로 overflow 잠금만으로 충분하다.
 */
export function useBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevBodyTouchAction = body.style.touchAction

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'

    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      body.style.touchAction = prevBodyTouchAction
    }
  }, [active])
}

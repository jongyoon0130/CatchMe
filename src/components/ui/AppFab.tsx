interface Props {
  onClick: () => void
  'aria-label': string
  /** 하단 탭바 없이 단독 화면일 때 */
  solo?: boolean
}

/** 홈·알람 등 공통 하단 플로팅 + 버튼 */
export function AppFab({ onClick, 'aria-label': ariaLabel, solo }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`app-fab nb-btn nb-btn--accent${solo ? ' app-fab--solo' : ''}`}
    >
      +
    </button>
  )
}

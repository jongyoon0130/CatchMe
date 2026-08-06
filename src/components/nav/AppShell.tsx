import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { TabPager } from './TabPager'
import type { MainTab } from './types'

interface Props {
  activeTab: MainTab
  onTabChange: (tab: MainTab) => void
  showNav: boolean
  chat: ReactNode
  home: ReactNode
  alarm: ReactNode
  profile: ReactNode
}

/* 도크가 바닥에 더 붙으면서 예약 공간도 줄임 (aurora .app-bottom-nav-inner 참고) */
const BOTTOM_NAV_HEIGHT = '4.5rem'

export function AppShell({ activeTab, onTabChange, showNav, chat, home, alarm, profile }: Props) {
  return (
    <div className="h-full relative">
      <div
        className="h-full overflow-hidden"
        style={showNav ? { paddingBottom: `calc(${BOTTOM_NAV_HEIGHT} + env(safe-area-inset-bottom, 0px))` } : undefined}
      >
        <TabPager
          active={activeTab}
          onChange={onTabChange}
          enabled={showNav}
          chat={chat}
          home={home}
          alarm={alarm}
          profile={profile}
        />
      </div>
      {showNav && <BottomNav active={activeTab} onChange={onTabChange} />}
    </div>
  )
}

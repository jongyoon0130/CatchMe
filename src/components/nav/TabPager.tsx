import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { MAIN_TABS, type MainTab } from './types'

function useSwipeTabPager(): boolean {
  const [swipe, setSwipe] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)').matches : true,
  )
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setSwipe(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return swipe
}

interface Props {
  active: MainTab
  onChange: (tab: MainTab) => void
  enabled: boolean
  chat: ReactNode
  home: ReactNode
  alarm: ReactNode
  profile: ReactNode
}

const TAB_INDEX: Record<MainTab, number> = {
  home: 0,
  chat: 1,
  alarm: 2,
  profile: 3,
}

export function TabPager({ active, onChange, enabled, chat, home, alarm, profile }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef(0)
  const scrollRafRef = useRef<number | null>(null)
  const programmaticScrollRef = useRef(false)
  const swipeTabs = useSwipeTabPager()
  const pagerEnabled = enabled && swipeTabs

  const scrollToTab = useCallback((tab: MainTab, behavior: ScrollBehavior = 'smooth') => {
    const el = scrollerRef.current
    if (!el) return
    const width = widthRef.current || el.clientWidth
    programmaticScrollRef.current = true
    el.scrollTo({ left: TAB_INDEX[tab] * width, behavior })
    window.setTimeout(() => {
      programmaticScrollRef.current = false
    }, behavior === 'smooth' ? 320 : 0)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !pagerEnabled) return

    const measure = () => {
      widthRef.current = el.clientWidth
      scrollToTab(active, 'auto')
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active, pagerEnabled, scrollToTab])

  useEffect(() => {
    if (!pagerEnabled) return
    scrollToTab(active)
  }, [active, pagerEnabled, scrollToTab])

  const handleScroll = () => {
    if (!pagerEnabled || programmaticScrollRef.current) return
    if (scrollRafRef.current != null) return
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      const el = scrollerRef.current
      if (!el) return
      const width = widthRef.current || el.clientWidth
      if (!width) return
      const index = Math.round(el.scrollLeft / width)
      const tab = MAIN_TABS[Math.min(Math.max(index, 0), MAIN_TABS.length - 1)]
      if (tab && tab !== active) onChange(tab)
    })
  }

  if (!pagerEnabled) {
    return (
      <div className="h-full overflow-hidden">
        {active === 'chat' && chat}
        {active === 'home' && home}
        {active === 'alarm' && alarm}
        {active === 'profile' && profile}
      </div>
    )
  }

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      className="tab-pager h-full flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {/* tab-panel-inactive: 다른 탭에 있을 때 홈의 fixed FAB가 비쳐 보이지 않게 (goal-app.css) */}
      <div className={`w-full shrink-0 snap-center h-full overflow-hidden${active === 'home' ? '' : ' tab-panel-inactive'}`}>
        {home}
      </div>
      <div className={`w-full shrink-0 snap-center h-full overflow-hidden${active === 'chat' ? '' : ' tab-panel-inactive'}`}>{chat}</div>
      <div className={`w-full shrink-0 snap-center h-full overflow-hidden${active === 'alarm' ? '' : ' tab-panel-inactive'}`}>{alarm}</div>
      <div className={`w-full shrink-0 snap-center h-full overflow-hidden${active === 'profile' ? '' : ' tab-panel-inactive'}`}>{profile}</div>
    </div>
  )
}

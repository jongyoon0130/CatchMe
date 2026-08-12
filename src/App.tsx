import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import type { SelfProfile } from './types/self'
import { ChatOnboarding } from './components/onboarding/ChatOnboarding'
import { ChatScreen } from './components/chat/ChatScreen'
import { ProfileListScreen } from './components/list/ProfileListScreen'
import { HomeScreen } from './components/home/HomeScreen'
import { AlarmScreen } from './components/alarm/AlarmScreen'
import { ProfileScreen } from './components/profile/ProfileScreen'
import { AppShell } from './components/nav/AppShell'
import { DEFAULT_MAIN_TAB, type MainTab } from './components/nav/types'
import { AuthScreen } from './components/auth/AuthScreen'
import { APP_NAME } from './lib/brand'
import { FutureMeLogo } from './components/brand/FutureMeLogo'
import { useAuth } from './contexts/AuthContext'
import { useAlarmScheduler } from './hooks/useAlarmScheduler'
import { subscribeCloudPushStatus, isCloudPushFailing } from './lib/syncStatus'
import {
  ensureMigrated,
  loadProfileSummaries,
  loadProfileById,
  saveProfileRecord,
  deleteProfileRecord,
  reconcileProfileSummariesFromChats,
  clearOnboardingProgress,
  loadOnboardingProgress,
  ONBOARDING_PROGRESS_VERSION,
  type OnboardingProgressHead,
  parseBackup,
  applyBackup,
  saveChatAsync,
  loadModel,
  type ProfileSummary,
} from './lib/storage'
import { clearPrimaryProfileId, getPrimaryProfileId, setPrimaryProfileId } from './lib/primaryProfile'

type Screen = 'list' | 'onboarding' | 'chat'

export default function App() {
  const { configured, loading: authLoading, syncing, session } = useAuth()
  useAlarmScheduler()
  const cloudPushFailing = useSyncExternalStore(subscribeCloudPushStatus, isCloudPushFailing)
  const [activeTab, setActiveTab] = useState<MainTab>(DEFAULT_MAIN_TAB)
  // 탭 전환 때마다 증가 — 프로필 탭이 최신 데이터를 다시 읽게 하는 신호
  const [navSeq, setNavSeq] = useState(0)
  const changeTab = useCallback((tab: MainTab) => {
    setNavSeq((n) => n + 1)
    setActiveTab(tab)
  }, [])
  const [screen, setScreen] = useState<Screen>('list')
  const [summaries, setSummaries] = useState<ProfileSummary[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [profile, setProfile] = useState<SelfProfile | null>(null)
  const [ready, setReady] = useState(false)

  const refreshList = useCallback(() => {
    setSummaries(loadProfileSummaries())
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (configured && !session) {
      setReady(false)
      return
    }
    ensureMigrated().then(async () => {
      loadModel()
      await reconcileProfileSummariesFromChats()
      refreshList()
      setReady(true)
    })
  }, [authLoading, configured, session, refreshList])

  useEffect(() => {
    if (!syncing && session) {
      void reconcileProfileSummariesFromChats().then(refreshList)
    }
  }, [syncing, session, refreshList])

  // 알림을 눌러 들어왔을 때 "오늘 홈"으로 데려간다.
  useEffect(() => {
    const goHome = () => {
      setScreen('list')
      changeTab('home')
    }
    const onSwMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'futureme-open') goHome()
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    try {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab === 'home' || tab === 'chat' || tab === 'profile' || tab === 'alarm') {
        setActiveTab(tab as MainTab)
        params.delete('tab')
        const qs = params.toString()
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
      }
    } catch {
      /* ignore */
    }
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage)
  }, [changeTab])

  const openProfile = (id: string) => {
    const p = loadProfileById(id)
    if (!p) return
    setPrimaryProfileId(id)
    setActiveProfileId(id)
    setProfile(p)
    setScreen('chat')
  }

  const handleComplete = (p: SelfProfile) => {
    const saved: SelfProfile = {
      ...p,
      id: p.id || crypto.randomUUID(),
    }
    saveProfileRecord(saved)
    setPrimaryProfileId(saved.id)
    refreshList()
    setActiveProfileId(saved.id)
    setProfile(saved)
    setScreen('chat')
  }

  const handleProfileUpdate = (next: SelfProfile) => {
    saveProfileRecord(next)
    setProfile(next)
  }

  const startOnboarding = useCallback(() => {
    // 저장 단위는 pageIdx(몇 번째 장)다. 이름이 어긋나면 확인 창이 안 뜨고
    // 조용히 처음부터 시작된다 — 그래서 모양을 storage.ts에 모아뒀다.
    const saved = loadOnboardingProgress<OnboardingProgressHead>()
    if (saved?.version === ONBOARDING_PROGRESS_VERSION && saved.pageIdx && saved.pageIdx > 0) {
      const resume = window.confirm(
        '진행 중인 만들기가 저장돼 있어요.\n\n확인 → 이어서 만들기\n취소 → 처음부터 새로 만들기',
      )
      if (resume) {
        setScreen('onboarding')
        return
      }
    }
    clearOnboardingProgress()
    setScreen('onboarding')
  }, [])

  // 처음 온 사람에게 텅 빈 목표 달력을 보여주면 뭘 해야 할지 알 수 없다.
  // 프로필이 하나도 없으면 바로 "미래의 나 만들기"를 연다.
  // ref 잠금이 핵심 — 없으면 만들기에서 나가도 프로필이 여전히 0개라 다시 튕겨 들어간다.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!ready || autoStarted.current) return
    autoStarted.current = true
    if (summaries.length === 0) {
      setActiveTab('chat')
      startOnboarding()
    }
  }, [ready, summaries.length, startOnboarding])

  const handleBackFromChat = () => {
    void reconcileProfileSummariesFromChats().then(() => {
      refreshList()
      setActiveProfileId(null)
      setProfile(null)
      setActiveTab('chat')
      setScreen('list')
    })
  }

  // 채팅의 "계획" 버튼 — 예전엔 별도 구 플래너 화면을 열었지만,
  // 이제 계획의 정본은 홈 계획표 하나다. 채팅을 닫고 홈 탭으로 보낸다.
  const handleOpenPlanner = () => {
    void reconcileProfileSummariesFromChats().then(() => {
      refreshList()
      setActiveProfileId(null)
      setProfile(null)
      setActiveTab('home')
      setScreen('list')
    })
  }

  const handleDeleteProfile = async (id: string) => {
    await deleteProfileRecord(id)
    if (getPrimaryProfileId() === id) clearPrimaryProfileId()
    if (activeProfileId === id) {
      setActiveProfileId(null)
      setProfile(null)
      setScreen('list')
    }
    refreshList()
  }

  const handleProfileDeleted = () => {
    refreshList()
    setActiveProfileId(null)
    setProfile(null)
    setScreen('list')
  }

  const handleRestoreBackup = async (file: File) => {
    try {
      const backup = parseBackup(await file.text())
      if (!backup) {
        window.alert('백업 파일 형식이 맞지 않아요.')
        return
      }
      const id = await applyBackup(backup)
      await saveChatAsync(id, backup.messages)
      const restored = loadProfileById(id)
      if (!restored) return
      refreshList()
      setActiveProfileId(id)
      setProfile(restored)
      setScreen('chat')
    } catch {
      window.alert('백업을 불러오지 못했어요. 파일을 다시 확인해주세요.')
    }
  }

  if (authLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted bg-void">
        <FutureMeLogo size={56} />
        {APP_NAME} 불러오는 중…
      </div>
    )
  }

  if (configured && !session) {
    return <AuthScreen />
  }

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted bg-void">
        <FutureMeLogo size={56} />
        {APP_NAME} 불러오는 중…
      </div>
    )
  }

  return (
    <div className="goal-app h-full bg-void">
      {configured && session && syncing && (
        <div
          className="fixed top-0 inset-x-0 z-50 py-1.5 text-center text-[11px] text-muted bg-surface/90 border-b border-border/30 backdrop-blur-sm"
          role="status"
        >
          데이터 동기화 중…
        </div>
      )}
      {configured && session && !syncing && cloudPushFailing && (
        <div
          className="fixed top-0 inset-x-0 z-50 py-1.5 text-center text-[11px] text-status-warn bg-status-warn/10 border-b border-status-warn/25 backdrop-blur-sm"
          role="status"
        >
          클라우드 저장 실패 — 지금은 이 기기에만 저장되고 있어요. 다음 저장·동기화 때 다시 시도해요.
        </div>
      )}
      <div className="relative h-full app-viewport app-viewport-shadow">
        <AppShell
          activeTab={activeTab}
          onTabChange={changeTab}
          showNav={screen === 'list'}
          chat={
            <ProfileListScreen
              summaries={summaries}
              onSelect={openProfile}
              onCreateNew={startOnboarding}
              onRestoreBackup={handleRestoreBackup}
              onDelete={handleDeleteProfile}
              primaryId={getPrimaryProfileId()}
            />
          }
          home={<HomeScreen />}
          alarm={<AlarmScreen />}
          profile={
            <ProfileScreen
              refreshKey={navSeq}
              onOpenChat={(id) => {
                setActiveTab('chat')
                openProfile(id)
              }}
              onOpenHome={() => changeTab('home')}
              onCreate={startOnboarding}
            />
          }
        />

        {screen === 'onboarding' && (
          <div className="fixed inset-0 z-40 bg-void">
            <ChatOnboarding
              onComplete={handleComplete}
              onExitToList={() => {
                setActiveTab('chat')
                setScreen('list')
              }}
            />
          </div>
        )}
        {screen === 'chat' && profile && activeProfileId && (
          <div className="fixed inset-0 z-40 bg-void">
            <ChatScreen
              profileId={activeProfileId}
              profile={profile}
              onBack={handleBackFromChat}
              onProfileDeleted={handleProfileDeleted}
              onProfileUpdate={handleProfileUpdate}
              onOpenPlanner={handleOpenPlanner}
            />
          </div>
        )}
      </div>
    </div>
  )
}

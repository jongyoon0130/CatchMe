import { isIosNative } from '../../lib/platform'

const PERMISSIONS = [
  {
    title: '사진 · 카메라',
    detail: '프로필 미래 카메라에 현재 모습 사진을 올릴 때만 사용해요.',
    settingsKey: '사진',
  },
  {
    title: '알림',
    detail: '할 일 시간 알림과 알람 리마인더를 보낼 때 필요해요.',
    settingsKey: '알림',
  },
  {
    title: '알람 (AlarmKit)',
    detail: '알람 탭에서 설정한 다짐 알람을 잠금 화면에서 울릴 때 필요해요. iOS 26 이상.',
    settingsKey: '알람',
  },
] as const

function openDeviceSettings() {
  window.location.href = 'app-settings:'
}

export function AppPermissionsSection() {
  const nativeIos = isIosNative()

  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">권한</p>
      <p className="text-[11px] text-muted/80 leading-relaxed mb-3">
        각 기능을 처음 쓸 때 iPhone이 허용 여부를 물어봐요. 거절했거나 바꾸고 싶다면 iPhone 설정에서
        Future Me 항목을 열어주세요.
      </p>
      <ul className="space-y-2.5">
        {PERMISSIONS.map((item) => (
          <li key={item.title} className="nb-card rounded-2xl px-3.5 py-3">
            <p className="text-[13px] font-bold text-ink">{item.title}</p>
            <p className="text-[11px] text-muted leading-relaxed mt-1">{item.detail}</p>
          </li>
        ))}
      </ul>
      {nativeIos ? (
        <button
          type="button"
          onClick={openDeviceSettings}
          className="nb-pill mt-3 w-full rounded-full py-2.5 text-center text-[12px] font-bold"
        >
          iPhone 설정 열기
        </button>
      ) : null}
    </section>
  )
}

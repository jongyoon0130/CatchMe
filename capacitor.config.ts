import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.futureme.studio',
  appName: 'Catch Me',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    // 앱 테마(spray --au-bg)와 같은 크림색 — 위아래 세이프에어리어 색이 앱과 이어지게
    backgroundColor: '#faf7f2',
  },
  server: {
    // 로컬 개발 시 vite와 라이브 리로드 — 배포 빌드 전에는 주석 처리 권장
    // url: 'http://127.0.0.1:5173',
    // cleartext: true,
  },
}

export default config

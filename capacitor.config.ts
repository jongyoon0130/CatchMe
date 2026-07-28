import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.futureme.studio',
  appName: 'Future Me',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f4f5f9',
  },
  server: {
    // 로컬 개발 시 vite와 라이브 리로드 — 배포 빌드 전에는 주석 처리 권장
    // url: 'http://127.0.0.1:5173',
    // cleartext: true,
  },
}

export default config

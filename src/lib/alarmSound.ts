import { loadAlarmAlertMode, type AlarmAlertMode } from './alarmAlertMode'
import { isNativeAlarmAvailable, pulseNativeAlarmHaptic } from './nativeAlarm/plugin'

let loopTimer: ReturnType<typeof setInterval> | null = null

/** 짧은 알람음 — 외부 mp3 없이 Web Audio로 만든다 (로컬 테스트용) */
export function playAlarmSound(): void {
  if (typeof window === 'undefined') return
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()

    const tone = (freq: number, start: number, duration: number, volume = 0.22) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t0 = ctx.currentTime + start
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
      osc.start(t0)
      osc.stop(t0 + duration + 0.02)
    }

    tone(880, 0, 0.14)
    tone(1100, 0.16, 0.14)
    tone(1320, 0.32, 0.22, 0.18)

    window.setTimeout(() => {
      void ctx.close()
    }, 800)
  } catch {
    /* ignore — 소리만 못 나는 경우 */
  }
}

function pulseVibrate(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([200, 120, 200, 120, 200])
  }
  if (isNativeAlarmAvailable()) {
    void pulseNativeAlarmHaptic()
  }
}

/** 모드를 고른 순간의 1회 피드백 — 소리는 한 번 울리고, 진동은 짧게 한 번, 무음은 없음 */
export function previewAlarmAlertMode(mode: AlarmAlertMode): void {
  if (mode === 'sound') {
    playAlarmSound()
    return
  }
  if (mode === 'vibrate') {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(200)
    }
    if (isNativeAlarmAvailable()) {
      void pulseNativeAlarmHaptic()
    }
  }
}

/** 해제할 때까지 설정(소리/진동/무음)에 맞게 반복 */
export function startAlarmSoundLoop(intervalMs = 2_400): void {
  if (typeof window === 'undefined') return
  stopAlarmSoundLoop()

  const mode = loadAlarmAlertMode()
  if (mode === 'silent') return

  if (mode === 'sound') {
    playAlarmSound()
    loopTimer = window.setInterval(() => playAlarmSound(), intervalMs)
    return
  }

  pulseVibrate()
  loopTimer = window.setInterval(() => pulseVibrate(), intervalMs)
}

export function stopAlarmSoundLoop(): void {
  if (loopTimer !== null) {
    window.clearInterval(loopTimer)
    loopTimer = null
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(0)
  }
}

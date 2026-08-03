import { Capacitor } from '@capacitor/core'

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function isIosNative(): boolean {
  return isNativeApp() && Capacitor.getPlatform() === 'ios'
}

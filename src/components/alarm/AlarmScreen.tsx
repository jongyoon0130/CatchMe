import { AlarmClockPanel } from '../alarm/AlarmClockPanel'

export function AlarmScreen() {
  return (
    <div className="h-full overflow-y-auto bg-void">
      <div className="max-w-lg mx-auto px-5 pt-6 pb-28">
        <AlarmClockPanel />
      </div>
    </div>
  )
}

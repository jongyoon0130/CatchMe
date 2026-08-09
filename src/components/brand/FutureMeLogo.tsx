/** Future Me — circular character + clock logo */
export const LOGO_SRC = '/logo.png?v=5'

interface Props {
  size?: number
  className?: string
  /** @deprecated PNG includes its own background; kept for call-site compat */
  withBackground?: boolean
}

export function FutureMeLogo({ size = 48, className = '' }: Props) {
  return (
    <img
      src={LOGO_SRC}
      alt="Future Me"
      width={size}
      height={size}
      className={`shrink-0 block object-contain ${className}`}
      draggable={false}
      decoding="async"
    />
  )
}

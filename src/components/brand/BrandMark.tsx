/**
 * 헤더 왼쪽 상단 로고 — 원 밖은 투명해서 앱 배경색이 그대로 비친다.
 */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <img
      src="/icons/brand-mark.png?v=5"
      alt=""
      width={size}
      height={size}
      className="shrink-0 block object-contain"
      draggable={false}
      decoding="async"
      aria-hidden
    />
  )
}

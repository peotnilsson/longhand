/**
 * The Longhand mark: an H standing inside an L.
 *
 * Drawn on a 24 grid with a 3-unit stroke and every coordinate on a multiple
 * of 1.5, so at 16px — a sidebar, a browser tab — the strokes land on whole
 * pixels instead of going soft. The proportions are the ones that survive that
 * size: the H wide enough to keep an open counter, the L's stem taller than it
 * and its foot stopping just past it, so three equal verticals never read as a
 * Ш. public/favicon.svg is the same geometry on a 32 grid.
 *
 * It takes `currentColor`, so it is the same colour as the text beside it in
 * both themes and needs no palette of its own.
 */
export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="square"
      strokeLinejoin="miter"
      role="img"
      aria-label="Longhand"
    >
      <path d="M4.5 4.5V18H19.5" />
      <path d="M10.5 9V18" />
      <path d="M16.5 9V18" />
      <path d="M10.5 13.5H16.5" />
    </svg>
  )
}

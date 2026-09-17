import type { PlotData } from './engine'

const WIDTH = 560
const HEIGHT = 240
const PAD = { top: 12, right: 14, bottom: 34, left: 62 }

/** Round a range outwards to readable tick values. */
function ticks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10
  const start = Math.ceil(min / step) * step
  const out: number[] = []
  for (let value = start; value <= max + step / 1000; value += step) out.push(value)
  return out
}

const label = (value: number): string =>
  Math.abs(value) >= 1e5 || (Math.abs(value) < 1e-3 && value !== 0)
    ? value.toExponential(1)
    : String(Number(value.toPrecision(4)))

export function Plot({ data }: { data: PlotData }) {
  const xs = data.points.map((point) => point.x)
  const ys = data.points.map((point) => point.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const ySpan = yMax - yMin || Math.abs(yMax) || 1
  const yLow = yMin - ySpan * 0.08
  const yHigh = yMax + ySpan * 0.08

  const px = (x: number) =>
    PAD.left + ((x - xMin) / (xMax - xMin || 1)) * (WIDTH - PAD.left - PAD.right)
  const py = (y: number) =>
    HEIGHT - PAD.bottom - ((y - yLow) / (yHigh - yLow || 1)) * (HEIGHT - PAD.top - PAD.bottom)

  const path = data.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${px(point.x).toFixed(2)},${py(point.y).toFixed(2)}`)
    .join(' ')

  return (
    <figure className="plot">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${data.yLabel} against ${data.xLabel}`}>
        {ticks(yLow, yHigh).map((value) => (
          <g key={`y${value}`}>
            <line className="grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={py(value)} y2={py(value)} />
            <text className="tick" x={PAD.left - 8} y={py(value)} textAnchor="end" dominantBaseline="middle">
              {label(value)}
            </text>
          </g>
        ))}
        {ticks(xMin, xMax).map((value) => (
          <text
            key={`x${value}`}
            className="tick"
            x={px(value)}
            y={HEIGHT - PAD.bottom + 16}
            textAnchor="middle"
          >
            {label(value)}
          </text>
        ))}
        <line className="axis" x1={PAD.left} x2={WIDTH - PAD.right} y1={HEIGHT - PAD.bottom} y2={HEIGHT - PAD.bottom} />
        <line className="axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={HEIGHT - PAD.bottom} />
        <path className="series" d={path} />
        <text className="axis-label" x={WIDTH - PAD.right} y={HEIGHT - 4} textAnchor="end">
          {data.xLabel}
        </text>
      </svg>
      <figcaption>{data.yLabel}</figcaption>
    </figure>
  )
}

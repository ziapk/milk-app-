import { useEffect, useRef, useState } from 'react';
import { compact, fmtShortDay, num } from '../format';

// Single-series daily column chart: rounded data-ends, 2px gaps, hairline grid, hover tooltip,
// and a table view so the numbers are readable without the chart.
const H = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 40 };

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= v) * mag;
  return step;
}

// Column with 4px rounded top, square at the baseline.
function column(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export default function BarChart({ data, unit, label }) {
  const box = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = width < 480 ? 10 : 7;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="chart" ref={box}>
      <svg width={width} height={H} role="img" aria-label={`${label}: ${num(total, 1)} ${unit} in ${data.length} days`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{compact(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = (d.value / max) * plotH;
          const isLast = i === data.length - 1;
          return (
            <g key={d.day}>
              {d.value > 0 && <path d={column(x, y(d.value), barW, h)} className={`bar ${hover === i ? 'on' : ''}`} />}
              {(i % labelEvery === 0 || isLast) && (
                <text x={x + barW / 2} y={H - 8} className="tick" textAnchor={isLast ? 'end' : 'middle'}>
                  {fmtShortDay(d.day)}
                </text>
              )}
              {/* Hit target: the whole column, much bigger than the bar */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="tip"
          style={{
            left: Math.min(width - 130, Math.max(0, PAD.left + hover * slot + slot / 2 - 65)),
            top: Math.max(0, y(data[hover].value) - 54),
          }}
        >
          <small>{fmtShortDay(data[hover].day)}</small>
          <b>{num(data[hover].value, 1)} {unit}</b>
        </div>
      )}
      <details className="table-view">
        <summary>View as table</summary>
        <table className="table compact">
          <thead><tr><th>Day</th><th className="r">{label}</th></tr></thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day}><td>{fmtShortDay(d.day)}</td><td className="r">{num(d.value, 1)} {unit}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

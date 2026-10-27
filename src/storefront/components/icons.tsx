/** Small inline icons (15 px, currentColor), so the components need no icon package */

const base = {
  width: 15,
  height: 15,
  viewBox: "0 0 15 15",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
}

export function CopyIcon() {
  return (
    <svg {...base}>
      <rect x="5" y="5" width="8" height="8" rx="1.5" />
      <path d="M10 5V3.5A1.5 1.5 0 0 0 8.5 2h-5A1.5 1.5 0 0 0 2 3.5v5A1.5 1.5 0 0 0 3.5 10H5" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg {...base}>
      <path d="m3.5 7.5 2.5 2.5 5.5-5.5" />
    </svg>
  )
}

export function DownloadIcon() {
  return (
    <svg {...base}>
      <path d="M7.5 2v8M4 7l3.5 3.5L11 7M2.5 13h10" />
    </svg>
  )
}

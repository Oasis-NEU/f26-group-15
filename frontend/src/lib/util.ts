export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Distinct, colorblind-aware class colors that read well over dark medical images. */
export const CLASS_COLORS = [
  '#F2C14E', // marigold
  '#5BD1B9', // seafoam
  '#F07C6B', // coral
  '#B39DFA', // lavender
  '#7FC8F8', // sky
  '#E9A6D8', // orchid
  '#A8D672', // lime
  '#F5A65B', // apricot
]

export function nextClassColor(used: string[]): string {
  return CLASS_COLORS.find((c) => !used.includes(c)) ?? CLASS_COLORS[used.length % CLASS_COLORS.length]
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  const run = (...args: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = undefined
      fn(...args)
    }, ms)
  }
  run.flush = (...args: A) => {
    if (t) clearTimeout(t)
    t = undefined
    fn(...args)
  }
  run.cancel = () => {
    if (t) clearTimeout(t)
    t = undefined
  }
  return run
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  return new Date(iso).toLocaleDateString()
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

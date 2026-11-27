import { useEffect, useRef } from 'react'
import { Kbd } from '../ui'

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Tools',
    rows: [
      [['V'], 'Select and edit'],
      [['H'], 'Pan (or hold Space)'],
      [['B'], 'Box'],
      [['P'], 'Polygon'],
      [['E'], 'Find similar: draw one example'],
      [['1', '–', '9'], 'Choose label class'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      [['Enter'], 'Accept selected suggestion / close polygon'],
      [['Shift', 'Enter'], 'Accept all suggestions'],
      [['Delete'], 'Delete or reject selected'],
      [['Esc'], 'Cancel drawing, then deselect'],
      [['Ctrl', 'Z'], 'Undo'],
      [['Ctrl', 'Shift', 'Z'], 'Redo'],
    ],
  },
  {
    title: 'View and images',
    rows: [
      [['Scroll'], 'Zoom toward cursor'],
      [['F'], 'Fit image'],
      [['0'], 'Show at 100%'],
      [['+', '/', '-'], 'Zoom in / out'],
      [['←', '/', '→'], 'Previous / next image'],
      [['R'], 'Mark reviewed and go to next'],
    ],
  },
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <div className="dialog-head">
          <h2>Keyboard shortcuts</h2>
          <button className="btn btn-small" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <div className="shortcut-groups">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map(([keys, label]) => (
                  <div key={label}>
                    <dt>
                      {keys.map((k, i) =>
                        k === '/' || k === '–' ? (
                          <span key={i} className="muted">
                            {' '}
                            {k}{' '}
                          </span>
                        ) : (
                          <Kbd key={i}>{k}</Kbd>
                        ),
                      )}
                    </dt>
                    <dd>{label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </dialog>
  )
}

import { useStore } from '../../store/createStore'
import { labeling, labelingStore, type ToolId } from '../../store/labeling'
import type { IconName } from '../Icon'
import { IconButton } from '../ui'

export const TOOLS: { id: ToolId; icon: IconName; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select and edit', key: 'V' },
  { id: 'pan', icon: 'hand', label: 'Pan', key: 'H' },
  { id: 'bbox', icon: 'box', label: 'Box', key: 'B' },
  { id: 'polygon', icon: 'polygon', label: 'Polygon', key: 'P' },
  { id: 'exemplar', icon: 'target', label: 'Find similar: draw one example', key: 'E' },
]

export function ToolRail({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const tool = useStore(labelingStore, (s) => s.tool)
  const canUndo = useStore(labelingStore, (s) => s.past.length > 0)
  const canRedo = useStore(labelingStore, (s) => s.future.length > 0)
  return (
    <nav className="rail" aria-label="Tools">
      {TOOLS.map((t, i) => (
        <span key={t.id} className={i === 4 ? 'rail-ai' : undefined}>
          <IconButton
            icon={t.icon}
            label={t.label}
            shortcut={t.key}
            active={tool === t.id}
            variant={t.id === 'exemplar' ? 'ai' : undefined}
            onClick={() => labeling.setTool(t.id)}
          />
        </span>
      ))}
      <span className="rail-sep" />
      <IconButton icon="undo" label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={labeling.undo} />
      <IconButton icon="redo" label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={labeling.redo} />
      <span className="rail-fill" />
      <IconButton icon="keyboard" label="Keyboard shortcuts" shortcut="?" onClick={onShowShortcuts} />
    </nav>
  )
}

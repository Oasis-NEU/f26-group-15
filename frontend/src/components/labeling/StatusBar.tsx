import { useStore } from '../../store/createStore'
import { labelingStore, type ToolId } from '../../store/labeling'
import { viewActions, viewStore } from '../../store/view'
import { IconButton } from '../ui'

const HINTS: Record<ToolId, string> = {
  select: 'Click a shape to select it, drag to move. Drag empty space to pan.',
  pan: 'Drag to pan. Scroll to zoom.',
  bbox: 'Drag to draw a box. Hold Space to pan.',
  polygon: 'Click to add points. Click the first point or press Enter to close. Esc cancels.',
  exemplar: 'Draw a box around one good example. The AI will look for similar objects.',
}

export function StatusBar() {
  const tool = useStore(labelingStore, (s) => s.tool)
  const scale = useStore(viewStore, (s) => s.view.scale)
  const cursor = useStore(viewStore, (s) => s.cursor)
  const brightness = useStore(viewStore, (s) => s.brightness)
  const contrast = useStore(viewStore, (s) => s.contrast)

  return (
    <div className="statusbar">
      <span className="hint">{HINTS[tool]}</span>
      <span className="status-group" aria-label="Display adjustments">
        <label className="mini-slider" title="Brightness (display only)">
          <span>Brightness</span>
          <input
            type="range"
            min={0.4}
            max={2.5}
            step={0.05}
            value={brightness}
            onChange={(e) => viewStore.setState({ brightness: Number(e.target.value) })}
            onDoubleClick={() => viewStore.setState({ brightness: 1 })}
          />
        </label>
        <label className="mini-slider" title="Contrast (display only)">
          <span>Contrast</span>
          <input
            type="range"
            min={0.4}
            max={3}
            step={0.05}
            value={contrast}
            onChange={(e) => viewStore.setState({ contrast: Number(e.target.value) })}
            onDoubleClick={() => viewStore.setState({ contrast: 1 })}
          />
        </label>
      </span>
      <span className="coords" aria-live="off">
        {cursor ? `x ${Math.floor(cursor.x)}  y ${Math.floor(cursor.y)}` : ''}
      </span>
      <span className="status-group">
        <IconButton icon="minus" label="Zoom out" shortcut="-" onClick={() => viewActions.zoomBy(1 / 1.25)} />
        <button className="zoom-readout" title="Show at 100% (0)" onClick={viewActions.actualSize}>
          {Math.round(scale * 100)}%
        </button>
        <IconButton icon="plus" label="Zoom in" shortcut="+" onClick={() => viewActions.zoomBy(1.25)} />
        <IconButton icon="fit" label="Fit to screen" shortcut="F" onClick={viewActions.fit} />
      </span>
    </div>
  )
}

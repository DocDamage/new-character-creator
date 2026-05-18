import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import {
  fillMask,
  getMaskBounds,
  growMask,
  invertMask,
  maskToDataUrl,
  mirrorMask,
  nudgeMask,
  paintMaskPixel,
  rectToMask,
  shrinkMask,
} from './maskTools'
import type { ExtractedPart, PartLabel, Rect } from './types'
import { slugLabel } from './utils'

type MaskTool = 'pencil' | 'eraser' | 'fill'
const newManualPartOption = '__new_manual_part__'

type SaveMaskRequest = {
  sourcePartId?: string
  maskDataUrl: string
  bounds: Rect
}

type MaskEditorProps = {
  parts: ExtractedPart[]
  selectedRegion: PartLabel
  region: Rect
  sourceFramePath?: string
  onSaveMask: (request: SaveMaskRequest) => void
}

export function MaskEditor({ parts, selectedRegion, region, sourceFramePath, onSaveMask }: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskRef = useRef<Uint8Array>(new Uint8Array(64 * 64))
  const [selectedPartId, setSelectedPartId] = useState('')
  const [tool, setTool] = useState<MaskTool>('pencil')
  const [brushSize, setBrushSize] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [keyboardCursor, setKeyboardCursor] = useState(() => ({ x: region.x, y: region.y }))
  const [revision, setRevision] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Choose an extracted part or start a new manual cleanup pass.')

  const regionParts = useMemo(() => {
    return parts.filter((part) => part.label === selectedRegion)
  }, [parts, selectedRegion])
  const activePartId = selectedPartId && regionParts.some((part) => part.part_id === selectedPartId)
    ? selectedPartId
    : regionParts[0]?.part_id ?? newManualPartOption
  const selectedPart = activePartId !== newManualPartOption
    ? regionParts.find((part) => part.part_id === activePartId)
    : undefined

  useEffect(() => {
    let cancelled = false
    loadMask(selectedPart, region)
      .then((mask) => {
        if (cancelled) return
        maskRef.current = mask
        setStatusMessage(selectedPart ? `Editing ${selectedPart.part_id}. Saving writes a reviewed manual part.` : 'New manual part will be created from the current region mask.')
        setRevision((value) => value + 1)
      })
      .catch((error) => {
        if (cancelled) return
        maskRef.current = rectToMask(region)
        setStatusMessage(`Could not load the saved mask. Using the current region instead. ${error instanceof Error ? error.message : String(error)}`)
        setRevision((value) => value + 1)
      })
    return () => {
      cancelled = true
    }
  }, [selectedPart, region])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const drawContext = context

    let cancelled = false
    canvas.width = 64
    canvas.height = 64
    drawContext.imageSmoothingEnabled = false

    async function draw() {
      drawContext.clearRect(0, 0, 64, 64)
      drawChecker(drawContext)
      const backgroundPath = selectedPart?.source_frame_path ?? sourceFramePath
      if (backgroundPath) {
        const image = await loadImage(backgroundPath)
        if (cancelled) return
        drawContext.globalAlpha = 0.55
        drawContext.drawImage(image, 0, 0, 64, 64)
        drawContext.globalAlpha = 1
      }

      drawContext.strokeStyle = '#f6cf78'
      drawContext.lineWidth = 1
      drawContext.strokeRect(region.x + 0.5, region.y + 0.5, Math.max(region.w - 1, 0), Math.max(region.h - 1, 0))

      const overlay = drawContext.createImageData(64, 64)
      const mask = maskRef.current
      for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index]) continue
        const offset = index * 4
        overlay.data[offset] = 108
        overlay.data[offset + 1] = 214
        overlay.data[offset + 2] = 143
        overlay.data[offset + 3] = 190
      }
      drawContext.putImageData(overlay, 0, 0)
    }

    draw().catch((error) => {
      if (!cancelled) {
        setStatusMessage(`Could not draw the mask editor preview. ${error instanceof Error ? error.message : String(error)}`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [region, revision, selectedPart, sourceFramePath])

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(63, Math.floor(((event.clientX - rect.left) / rect.width) * 64)))
    const y = Math.max(0, Math.min(63, Math.floor(((event.clientY - rect.top) / rect.height) * 64)))
    maskRef.current = tool === 'fill'
      ? fillMask(maskRef.current, x, y, true)
      : paintMaskPixel(maskRef.current, x, y, tool === 'pencil', brushSize)
    setRevision((value) => value + 1)
  }

  function paintAt(point: { x: number; y: number }) {
    maskRef.current = tool === 'fill'
      ? fillMask(maskRef.current, point.x, point.y, true)
      : paintMaskPixel(maskRef.current, point.x, point.y, tool === 'pencil', brushSize)
    setRevision((value) => value + 1)
  }

  function handleCanvasKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const delta = event.shiftKey ? 4 : 1
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      setKeyboardCursor((current) => ({
        x: Math.max(0, Math.min(63, current.x + (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0))),
        y: Math.max(0, Math.min(63, current.y + (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0))),
      }))
      return
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      paintAt(keyboardCursor)
    }
  }

  function saveMask() {
    const bounds = getMaskBounds(maskRef.current)
    if (!bounds) {
      setStatusMessage('Mask is empty. Paint at least one pixel before saving a manual part.')
      return
    }

    onSaveMask({
      sourcePartId: selectedPart?.part_id,
      maskDataUrl: maskToDataUrl(maskRef.current),
      bounds,
    })
    setStatusMessage(selectedPart ? `Saved reviewed manual variant for ${selectedPart.part_id}.` : 'Saved a new reviewed manual part from the current region.')
  }

  return (
    <div className="mask-editor">
      <div className="mask-editor-head">
        <strong>Manual mask cleanup</strong>
        <span>{selectedPart ? selectedPart.part_id : 'Extract a part to edit its mask.'}</span>
      </div>
      <label className="field">
        <span>Part</span>
        <select data-testid="mask-editor-part-select" value={activePartId} onChange={(event) => setSelectedPartId(event.target.value)}>
          <option value={newManualPartOption}>New manual part from current region</option>
          {regionParts.map((part) => (
            <option key={part.part_id} value={part.part_id}>
              {slugLabel(part.extraction_method)} - {part.part_id}
            </option>
          ))}
        </select>
      </label>
      <canvas
        ref={canvasRef}
        className="mask-canvas"
        tabIndex={0}
        role="img"
        aria-label="Mask cleanup canvas; use arrow keys to move the paint cursor and Space or Enter to paint."
        onKeyDown={handleCanvasKeyDown}
        onPointerDown={(event) => {
          setDragging(true)
          paint(event)
        }}
        onPointerMove={(event) => {
          if (dragging && tool !== 'fill') paint(event)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
      />
      <div className="mask-tools">
        <div className="mask-tool-grid">
          <button className={tool === 'pencil' ? 'active' : ''} onClick={() => setTool('pencil')}>Pencil</button>
          <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')}>Eraser</button>
          <button className={tool === 'fill' ? 'active' : ''} onClick={() => setTool('fill')}>Fill</button>
        </div>
        <label className="field">
          <span>Brush {brushSize}px</span>
          <input type="range" min={1} max={4} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
        </label>
        <div className="mask-action-grid">
          <button onClick={() => { maskRef.current = growMask(maskRef.current); setRevision((value) => value + 1) }}>Grow</button>
          <button onClick={() => { maskRef.current = shrinkMask(maskRef.current); setRevision((value) => value + 1) }}>Shrink</button>
          <button onClick={() => { maskRef.current = invertMask(maskRef.current); setRevision((value) => value + 1) }}>Invert</button>
          <button onClick={() => { maskRef.current = mirrorMask(maskRef.current); setRevision((value) => value + 1) }}>Mirror</button>
        </div>
        <div className="mask-nudge-grid">
          <button onClick={() => { maskRef.current = nudgeMask(maskRef.current, 0, -1); setRevision((value) => value + 1) }}>Nudge up</button>
          <button onClick={() => { maskRef.current = nudgeMask(maskRef.current, -1, 0); setRevision((value) => value + 1) }}>Nudge left</button>
          <button onClick={() => { maskRef.current = nudgeMask(maskRef.current, 1, 0); setRevision((value) => value + 1) }}>Nudge right</button>
          <button onClick={() => { maskRef.current = nudgeMask(maskRef.current, 0, 1); setRevision((value) => value + 1) }}>Nudge down</button>
        </div>
        <p className="mask-status">{statusMessage}</p>
        <button className="primary" data-testid="save-mask-part" onClick={saveMask}>Save cleanup as part</button>
      </div>
    </div>
  )
}

async function loadMask(part: ExtractedPart | undefined, fallbackRegion: Rect) {
  const mask = part ? rectToMask(part.bounds) : rectToMask(fallbackRegion)
  if (!part?.mask_data_url) return mask

  const image = await loadImage(part.mask_data_url)
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return mask
  context.drawImage(image, 0, 0, 64, 64)
  const data = context.getImageData(0, 0, 64, 64).data
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4
    mask[index] = data[offset + 3] > 0 && data[offset] + data[offset + 1] + data[offset + 2] > 0 ? 1 : 0
  }
  return mask
}

function drawChecker(context: CanvasRenderingContext2D) {
  for (let y = 0; y < 64; y += 4) {
    for (let x = 0; x < 64; x += 4) {
      context.fillStyle = (x / 4 + y / 4) % 2 === 0 ? '#18202a' : '#243140'
      context.fillRect(x, y, 4, 4)
    }
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
}

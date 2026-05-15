import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, PointerEvent, SetStateAction } from 'react'
import type { ExtractedPart, PartLabel } from './types'
import { slugLabel } from './utils'

type MaskTool = 'pencil' | 'eraser'

type MaskEditorProps = {
  parts: ExtractedPart[]
  selectedRegion: PartLabel
  onSaveMask: (partId: string, maskDataUrl: string) => void
}

export function MaskEditor({ parts, selectedRegion, onSaveMask }: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskRef = useRef<Uint8Array>(new Uint8Array(64 * 64))
  const [selectedPartId, setSelectedPartId] = useState('')
  const [tool, setTool] = useState<MaskTool>('pencil')
  const [brushSize, setBrushSize] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [revision, setRevision] = useState(0)

  const regionParts = useMemo(() => {
    return parts.filter((part) => part.label === selectedRegion)
  }, [parts, selectedRegion])
  const selectedPart = regionParts.find((part) => part.part_id === selectedPartId) ?? regionParts[0]

  useEffect(() => {
    setSelectedPartId(regionParts[0]?.part_id ?? '')
  }, [regionParts])

  useEffect(() => {
    if (!selectedPart) {
      maskRef.current = new Uint8Array(64 * 64)
      setRevision((value) => value + 1)
      return
    }

    let cancelled = false
    loadMask(selectedPart).then((mask) => {
      if (cancelled) return
      maskRef.current = mask
      setRevision((value) => value + 1)
    })
    return () => {
      cancelled = true
    }
  }, [selectedPart])

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
      drawChecker(drawContext)
      if (selectedPart?.image_data_url) {
        const image = await loadImage(selectedPart.image_data_url)
        if (cancelled) return
        drawContext.globalAlpha = 0.55
        drawContext.drawImage(image, selectedPart.bounds.x, selectedPart.bounds.y, selectedPart.bounds.w, selectedPart.bounds.h)
        drawContext.globalAlpha = 1
      }

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

    draw().catch((error) => console.error('Could not draw mask editor', error))
    return () => {
      cancelled = true
    }
  }, [selectedPart, revision])

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    if (!canvasRef.current || !selectedPart) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(63, Math.floor(((event.clientX - rect.left) / rect.width) * 64)))
    const y = Math.max(0, Math.min(63, Math.floor(((event.clientY - rect.top) / rect.height) * 64)))
    const radius = Math.max(0, brushSize - 1)
    const mask = maskRef.current.slice()

    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        const px = x + ox
        const py = y + oy
        if (px < 0 || py < 0 || px >= 64 || py >= 64) continue
        mask[py * 64 + px] = tool === 'pencil' ? 1 : 0
      }
    }

    maskRef.current = mask
    setRevision((value) => value + 1)
  }

  function saveMask() {
    if (!selectedPart) return
    onSaveMask(selectedPart.part_id, makeMaskDataUrl(maskRef.current))
  }

  return (
    <div className="mask-editor">
      <div className="mask-editor-head">
        <strong>Manual mask cleanup</strong>
        <span>{selectedPart ? selectedPart.part_id : 'Extract a part to edit its mask.'}</span>
      </div>
      <label className="field">
        <span>Part</span>
        <select value={selectedPart?.part_id ?? ''} onChange={(event) => setSelectedPartId(event.target.value)} disabled={regionParts.length === 0}>
          {regionParts.map((part) => (
            <option key={part.part_id} value={part.part_id}>
              {slugLabel(part.extraction_method)} - {part.part_id}
            </option>
          ))}
          {regionParts.length === 0 ? <option value="">No {slugLabel(selectedRegion)} parts</option> : null}
        </select>
      </label>
      <canvas
        ref={canvasRef}
        className="mask-canvas"
        onPointerDown={(event) => {
          setDragging(true)
          paint(event)
        }}
        onPointerMove={(event) => {
          if (dragging) paint(event)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
      />
      <div className="mask-tools">
        <button className={tool === 'pencil' ? 'active' : ''} onClick={() => setTool('pencil')}>Pencil</button>
        <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')}>Eraser</button>
        <label className="field">
          <span>Brush {brushSize}px</span>
          <input type="range" min={1} max={4} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
        </label>
        <button onClick={() => invertMask(maskRef.current, setRevision)} disabled={!selectedPart}>Invert</button>
        <button onClick={() => mirrorMask(maskRef.current, setRevision)} disabled={!selectedPart}>Mirror</button>
        <button className="primary" onClick={saveMask} disabled={!selectedPart}>Save reviewed mask</button>
      </div>
    </div>
  )
}

async function loadMask(part: ExtractedPart) {
  const mask = new Uint8Array(64 * 64)
  if (!part.mask_data_url) {
    for (let y = part.bounds.y; y < part.bounds.y + part.bounds.h; y += 1) {
      for (let x = part.bounds.x; x < part.bounds.x + part.bounds.w; x += 1) {
        if (x >= 0 && y >= 0 && x < 64 && y < 64) mask[y * 64 + x] = 1
      }
    }
    return mask
  }

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

function makeMaskDataUrl(mask: Uint8Array) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  const imageData = context.createImageData(64, 64)
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue
    const offset = index * 4
    imageData.data[offset] = 255
    imageData.data[offset + 1] = 255
    imageData.data[offset + 2] = 255
    imageData.data[offset + 3] = 255
  }
  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function invertMask(mask: Uint8Array, setRevision: Dispatch<SetStateAction<number>>) {
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = mask[index] ? 0 : 1
  }
  setRevision((value) => value + 1)
}

function mirrorMask(mask: Uint8Array, setRevision: Dispatch<SetStateAction<number>>) {
  const copy = mask.slice()
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      mask[y * 64 + x] = copy[y * 64 + (63 - x)]
    }
  }
  setRevision((value) => value + 1)
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

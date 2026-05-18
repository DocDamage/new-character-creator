import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'

type TooltipProps = {
  content: ReactNode
  children: ReactElement<{ 'aria-describedby'?: string }>
}

export function Tooltip({ content, children }: TooltipProps) {
  const tooltipId = useId()
  const describedChild = isValidElement<{ 'aria-describedby'?: string }>(children)
    ? cloneElement(children, {
        'aria-describedby': [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ') || undefined,
      })
    : children

  return (
    <span className="tooltip-wrap">
      {describedChild}
      <span id={tooltipId} className="tooltip-content" role="tooltip">
        {content}
      </span>
    </span>
  )
}

export type DetailsRecord = {
  title: string
  subtitle?: string
  fields: Array<{ label: string; value: ReactNode }>
}

type DetailsDrawerProps = {
  record: DetailsRecord | null
  onClose: () => void
}

export function DetailsDrawer({ record, onClose }: DetailsDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!record) return
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, record])

  if (!record) return null

  return (
    <aside className="details-drawer" aria-label="Details" role="dialog" aria-modal="false">
      <div className="details-drawer-head">
        <div>
          <strong>{record.title}</strong>
          {record.subtitle ? <span>{record.subtitle}</span> : null}
        </div>
        <Tooltip content="Close details">
          <button ref={closeButtonRef} type="button" aria-label="Close details" onClick={onClose}>x</button>
        </Tooltip>
      </div>
      <dl>
        {record.fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

type ContextMenuAction = {
  id: string
  label: string
  disabled?: boolean
  disabledReason?: string
  onSelect: () => void
}

function ContextMenuItems({
  actions,
  onClose,
  returnFocus,
}: {
  actions: ContextMenuAction[]
  onClose: () => void
  returnFocus?: () => void
}) {
  return (
    <div className="context-menu" role="menu">
      {actions.map((action) => (
        action.disabled && action.disabledReason ? (
          <Tooltip key={action.id} content={action.disabledReason}>
            <button
              type="button"
              role="menuitem"
              disabled
              onClick={() => {
                if (action.disabled) return
                action.onSelect()
                onClose()
                returnFocus?.()
              }}
            >
              {action.label}
            </button>
          </Tooltip>
        ) : (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            onClick={() => {
              if (action.disabled) return
              action.onSelect()
              onClose()
              returnFocus?.()
            }}
          >
            {action.label}
          </button>
        )
      ))}
    </div>
  )
}

type ContextMenuButtonProps = {
  label?: string
  actions: ContextMenuAction[]
}

export function ContextMenuButton({ label = 'More actions', actions }: ContextMenuButtonProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span ref={wrapRef} className="context-menu-wrap">
      <Tooltip content="More actions">
        <button
          ref={buttonRef}
          type="button"
          className="icon-button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
              event.preventDefault()
              setOpen(true)
            }
          }}
        >
          ...
        </button>
      </Tooltip>
      {open ? (
        <ContextMenuItems actions={actions} onClose={() => setOpen(false)} returnFocus={() => buttonRef.current?.focus()} />
      ) : null}
    </span>
  )
}

type ContextMenuAreaProps = {
  label: string
  actions: ContextMenuAction[]
  children: ReactNode
  allowInteractiveTargetEvents?: boolean
}

function isInteractiveContextTarget(target: EventTarget | null, container: HTMLElement | null) {
  if (!(target instanceof HTMLElement) || !container) return false
  const interactive = target.closest('button, input, select, textarea, a[href], summary, [role="button"], [role="menuitem"], [contenteditable="true"]')
  return Boolean(interactive && container.contains(interactive) && interactive !== container)
}

export function ContextMenuArea({ label, actions, children, allowInteractiveTargetEvents = false }: ContextMenuAreaProps) {
  const [open, setOpen] = useState(false)
  const areaRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!areaRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        areaRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={areaRef}
      className="context-menu-area"
      tabIndex={0}
      aria-label={label}
      onContextMenu={(event) => {
        if (!allowInteractiveTargetEvents && isInteractiveContextTarget(event.target, areaRef.current)) return
        event.preventDefault()
        setOpen(true)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          if (!allowInteractiveTargetEvents && isInteractiveContextTarget(event.target, areaRef.current)) return
          event.preventDefault()
          setOpen(true)
        }
      }}
    >
      {children}
      {open ? <ContextMenuItems actions={actions} onClose={() => setOpen(false)} returnFocus={() => areaRef.current?.focus()} /> : null}
    </div>
  )
}

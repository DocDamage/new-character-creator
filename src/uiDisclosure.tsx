import { useEffect, useRef, useState, type ReactNode } from 'react'

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
        <button ref={closeButtonRef} type="button" aria-label="Close details" title="Close details" onClick={onClose}>x</button>
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
        <button
          key={action.id}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          title={action.disabled ? action.disabledReason : action.label}
          onClick={() => {
            if (action.disabled) return
            action.onSelect()
            onClose()
            returnFocus?.()
          }}
        >
          {action.label}
        </button>
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
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!buttonRef.current?.parentElement?.contains(event.target as Node)) setOpen(false)
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
    <span className="context-menu-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
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
}

export function ContextMenuArea({ label, actions, children }: ContextMenuAreaProps) {
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
        event.preventDefault()
        setOpen(true)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
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

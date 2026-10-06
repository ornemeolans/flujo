import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './ui.module.css'

// ─── Accesibilidad ───────────────────────────────────────────
// Props para que un elemento no-botón (p. ej. una fila o tarjeta) se pueda
// usar con teclado y lo anuncien los lectores de pantalla como botón.
export function pressable(onClick, label) {
  if (!onClick) return {}
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick,
    onKeyDown: e => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) }
    },
  }
}

// ─── Card ────────────────────────────────────────────────────
export function Card({ children, className = '', onClick, style }) {
  return (
    <div
      className={`${styles.card} ${onClick ? styles.cardClickable : ''} ${className}`}
      {...pressable(onClick)}
      style={style}
    >
      {children}
    </div>
  )
}

// ─── Section ─────────────────────────────────────────────────
export function Section({ title, action, onAction, children, className = '' }) {
  return (
    <section className={`${styles.section} ${className}`}>
      {(title || action) && (
        <div className={styles.sectionHeader}>
          {title && <span className={styles.sectionTitle}>{title}</span>}
          {action && <button type="button" className={styles.sectionAction} onClick={onAction} aria-label={title ? `${action.replace(/^\+\s*/, '')}: ${title}` : undefined}>{action}</button>}
        </div>
      )}
      {children}
    </section>
  )
}

// ─── Button ──────────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  return (
    <button
      className={`${styles.btn} ${styles[`btn_${variant}`]} ${styles[`btn_${size}`]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

// ─── Input ───────────────────────────────────────────────────
export function Input({ label, hint, prefix, className = '', id, ...props }) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={styles.formGroup}>
      {label && <label className={styles.label} htmlFor={inputId}>{label}</label>}
      <div className={styles.inputWrap}>
        {prefix && <span className={styles.inputPrefix} aria-hidden="true">{prefix}</span>}
        <input
          id={inputId}
          className={`${styles.input} ${prefix ? styles.inputWithPrefix : ''} ${className}`}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          {...props}
        />
      </div>
      {hint && <span className={styles.hint} id={`${inputId}-hint`}>{hint}</span>}
    </div>
  )
}

// ─── Select ──────────────────────────────────────────────────
export function Select({ label, hint, className = '', children, id, ...props }) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <div className={styles.formGroup}>
      {label && <label className={styles.label} htmlFor={selectId}>{label}</label>}
      <select id={selectId} className={`${styles.input} ${className}`} aria-describedby={hint ? `${selectId}-hint` : undefined} {...props}>
        {children}
      </select>
      {hint && <span className={styles.hint} id={`${selectId}-hint`}>{hint}</span>}
    </div>
  )
}

// ─── Switch ──────────────────────────────────────────────────
export function Switch({ label, checked, onChange }) {
  const labelId = useId()
  return (
    <div className={styles.switchRow}>
      <span className={styles.switchLabel} id={labelId}>{label}</span>
      <button
        type="button"
        className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
      />
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────
export function Modal({ title, onClose, children, size = 'default' }) {
  const modalRef = useRef(null)
  const titleId = useId()
  // onClose suele ser una función nueva en cada render: con un ref el efecto
  // corre una sola vez y no le roba el foco al campo que se está editando
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    // Foco dentro del diálogo al abrir; al cerrar vuelve a donde estaba
    const previousFocus = document.activeElement
    if (modalRef.current) {
      modalRef.current.scrollTop = 0
      modalRef.current.focus({ preventScroll: true })
    }

    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    const handler = e => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', handler)

    return () => {
      previousFocus?.focus?.({ preventScroll: true })
      document.removeEventListener('keydown', handler)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  // Portal: se renderiza directamente en document.body,
  // fuera de cualquier contexto de z-index o stacking context
  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`${styles.modal} ${styles[`modal_${size}`]} animate-slideUp`}
      >
        <div className={styles.handle} aria-hidden="true" />
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">×</button>
        {title && <h2 className={styles.modalTitle} id={titleId}>{title}</h2>}
        {children}
      </div>
    </>,
    document.body
  )
}

// ─── Spinner ─────────────────────────────────────────────────
export function Spinner({ size = 24 }) {
  return (
    <div
      className={styles.spinner}
      style={{ width: size, height: size, borderWidth: size / 8 }}
    />
  )
}

// ─── Empty State ─────────────────────────────────────────────
export function Empty({ icon, text, action, onAction }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>{icon}</div>
      <div className={styles.emptyText}>{text}</div>
      {action && (
        <button className={`${styles.btn} ${styles.btn_ghost} ${styles.btn_sm}`} onClick={onAction} style={{ marginTop: 12 }}>
          {action}
        </button>
      )}
    </div>
  )
}

// ─── Badge ───────────────────────────────────────────────────
export function Badge({ children, variant = 'default' }) {
  return <span className={`${styles.badge} ${styles[`badge_${variant}`]}`}>{children}</span>
}

// ─── Color Dot Grid ──────────────────────────────────────────
export function ColorGrid({ colors, selected, onSelect }) {
  return (
    <div className={styles.colorGrid} role="radiogroup" aria-label="Color">
      {colors.map(color => (
        <button
          type="button"
          key={color}
          role="radio"
          aria-checked={color === selected}
          aria-label={`Color ${color}`}
          className={`${styles.colorDot} ${color === selected ? styles.colorDotSelected : ''}`}
          style={{ background: color }}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  )
}

// ─── Icon Grid ───────────────────────────────────────────────
export function IconGrid({ icons, selected, onSelect }) {
  return (
    <div className={styles.iconGrid} role="radiogroup" aria-label="Ícono">
      {icons.map(icon => (
        <button
          type="button"
          key={icon}
          role="radio"
          aria-checked={icon === selected}
          className={`${styles.iconBtn} ${icon === selected ? styles.iconBtnSelected : ''}`}
          onClick={() => onSelect(icon)}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

// ─── Amount Display ──────────────────────────────────────────
export function AmountDisplay({ amount, type, size = 'lg' }) {
  const positive = type === 'income' || amount >= 0
  return (
    <span className={`${styles[`amount_${size}`]} ${positive ? styles.amountPos : styles.amountNeg}`}>
      {positive ? '+' : '-'}${Math.abs(amount ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  )
}

// ─── Type Toggle ─────────────────────────────────────────────
export function TypeToggle({ value, onChange }) {
  return (
    <div className={styles.typeToggle}>
      <button
        type="button"
        aria-pressed={value === 'income'}
        className={`${styles.typeBtn} ${value === 'income' ? styles.typeBtnIncome : ''}`}
        onClick={() => onChange('income')}
      >
        ↑ Ingreso
      </button>
      <button
        type="button"
        aria-pressed={value === 'expense'}
        className={`${styles.typeBtn} ${value === 'expense' ? styles.typeBtnExpense : ''}`}
        onClick={() => onChange('expense')}
      >
        ↓ Egreso
      </button>
    </div>
  )
}
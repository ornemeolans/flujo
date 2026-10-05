import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './ui.module.css'

// ─── Card ────────────────────────────────────────────────────
export function Card({ children, className = '', onClick, style }) {
  return (
    <div
      className={`${styles.card} ${onClick ? styles.cardClickable : ''} ${className}`}
      onClick={onClick}
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
          {action && <span className={styles.sectionAction} onClick={onAction}>{action}</span>}
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
export function Input({ label, hint, prefix, className = '', ...props }) {
  return (
    <div className={styles.formGroup}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.inputWrap}>
        {prefix && <span className={styles.inputPrefix}>{prefix}</span>}
        <input
          className={`${styles.input} ${prefix ? styles.inputWithPrefix : ''} ${className}`}
          {...props}
        />
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}

// ─── Select ──────────────────────────────────────────────────
export function Select({ label, hint, className = '', children, ...props }) {
  return (
    <div className={styles.formGroup}>
      {label && <label className={styles.label}>{label}</label>}
      <select className={`${styles.input} ${className}`} {...props}>
        {children}
      </select>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}

// ─── Switch ──────────────────────────────────────────────────
export function Switch({ label, checked, onChange }) {
  return (
    <div className={styles.switchRow}>
      <span className={styles.switchLabel}>{label}</span>
      <div
        className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      />
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────
export function Modal({ title, onClose, children, size = 'default' }) {
  const modalRef = useRef(null)

  useEffect(() => {
    if (modalRef.current) modalRef.current.scrollTop = 0

    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)

    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [onClose])

  // Portal: se renderiza directamente en document.body,
  // fuera de cualquier contexto de z-index o stacking context
  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div
        ref={modalRef}
        className={`${styles.modal} ${styles[`modal_${size}`]} animate-slideUp`}
      >
        <div className={styles.handle} />
        <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">×</button>
        {title && <h2 className={styles.modalTitle}>{title}</h2>}
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
    <div className={styles.colorGrid}>
      {colors.map(color => (
        <div
          key={color}
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
    <div className={styles.iconGrid}>
      {icons.map(icon => (
        <div
          key={icon}
          className={`${styles.iconBtn} ${icon === selected ? styles.iconBtnSelected : ''}`}
          onClick={() => onSelect(icon)}
        >
          {icon}
        </div>
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
        className={`${styles.typeBtn} ${value === 'income' ? styles.typeBtnIncome : ''}`}
        onClick={() => onChange('income')}
      >
        ↑ Ingreso
      </button>
      <button
        type="button"
        className={`${styles.typeBtn} ${value === 'expense' ? styles.typeBtnExpense : ''}`}
        onClick={() => onChange('expense')}
      >
        ↓ Egreso
      </button>
    </div>
  )
}
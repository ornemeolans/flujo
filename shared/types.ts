// Modelos de datos compartidos entre la PWA y el servidor.
// Todo registro sincronizado lleva updatedAt/deletedAt (last-write-wins + borrado lógico).

/** Fecha local 'YYYY-MM-DD' */
export type ISODate = string

export interface SyncMeta {
  updatedAt?: number
  deletedAt?: number | null
}

export interface Wallet extends SyncMeta {
  id: string
  name: string
  type: 'cash' | 'virtual' | 'bank' | 'savings' | 'other'
  initialBalance: number
  icon?: string
  color?: string
  tnaEnabled?: boolean
  tna?: number
  /** Tasas anteriores: cada una rige desde `from` */
  tnaHistory?: { tna: number; from: ISODate }[]
  tnaChangedAt?: ISODate
  createdAt?: ISODate
}

export interface CreditCard extends SyncMeta {
  id: string
  name: string
  /** Día de cierre habitual del resumen */
  closeDay: number
  /** Cierres puntuales por resumen: { 'YYYY-MM': día } */
  closeOverrides?: Record<string, number>
  icon?: string
  color?: string
  createdAt?: ISODate
}

export interface Transaction extends SyncMeta {
  id: string
  type: 'income' | 'expense'
  amount: number
  /** Billetera o tarjeta */
  walletId: string
  category: string
  date: ISODate
  desc?: string
  cuotas?: number
  cuotaActual?: number
  createdAt?: ISODate
  /** Tarjeta: cuotas ya pagadas en resúmenes */
  paidCuotas?: number
  isYield?: boolean
  isTransfer?: boolean
  transferPairId?: string | null
  isCardPayment?: boolean
  keepsCardExpenses?: boolean
  loanId?: string
  loanCuota?: number
}

export interface RateChange {
  /** Primera cuota a la que aplica la nueva TNA */
  fromCuota: number
  tna: number
}

export interface Loan extends SyncMeta {
  id: string
  name: string
  walletId: string
  /** Monto pedido */
  principal: number
  /** Cantidad total de cuotas */
  cuotas: number
  /** Cuotas ya pagadas al cargarlo en la app (no se debitan) */
  paidBefore: number
  /** Vencimiento de la cuota paidBefore + 1 */
  firstDue: ISODate
  /** fixed: cuota informada por el banco · tna: sistema francés calculado */
  mode: 'fixed' | 'tna'
  cuotaAmount: number
  tna: number
  /** Sumar 21% de IVA sobre los intereses */
  iva: boolean
  rateChanges?: RateChange[]
  credited: boolean
  creditDate?: ISODate
  createdAt?: ISODate
}

export interface MonthRef {
  /** 0-11 */
  month: number
  year: number
}

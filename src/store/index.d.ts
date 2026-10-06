// Tipos del store (index.js), para usarlo desde TypeScript mientras se migra.
import type { UseBoundStore, StoreApi } from 'zustand'
import type { CreditCard, ISODate, Loan, MonthRef, Transaction, Wallet } from '@shared/types'

export interface FlujoState {
  wallets: Wallet[]
  cards: CreditCard[]
  transactions: Transaction[]
  loans: Loan[]
  loading: boolean
  currentMonth: number
  currentYear: number

  loadAll(): Promise<void>
  refresh(): Promise<void>
  loadDemo(): Promise<void>
  clearDemo(): Promise<void>
  setMonth(month: number, year: number): void

  saveWallet(data: Partial<Wallet>): Promise<Wallet>
  deleteWallet(id: string): Promise<void>
  saveCard(data: Partial<CreditCard>): Promise<CreditCard>
  setCardCloseOverride(cardId: string, month: number, year: number, day: number | null): Promise<void>
  deleteCard(id: string): Promise<void>
  saveLoan(data: Partial<Loan>): Promise<Loan>
  deleteLoan(id: string): Promise<void>
  saveTransaction(data: Partial<Transaction>): Promise<Transaction>
  deleteTransaction(id: string): Promise<void>
  transfer(args: { fromId: string; toId: string; amount: number; date?: ISODate; desc?: string }): Promise<void>
  payCard(args: { cardId: string; fromWalletId: string; amount: number; month: number; year: number; date?: ISODate }): Promise<void>
}

export const useStore: UseBoundStore<StoreApi<FlujoState>>

export interface CardPeriod extends MonthRef {
  closeDay: number
  label: 'resumen actual' | 'resumen siguiente'
}

export interface CardLineItem {
  tx: Transaction
  cuotaNum: number
  cuotaTotal: number
  lineAmount: number
  paid: boolean
}

export const selectors: {
  walletBalance(wallet: Wallet, transactions: Transaction[]): number
  totalBalance(wallets: Wallet[], transactions: Transaction[]): number
  walletMonthlyYield(wallet: Wallet, transactions: Transaction[]): number
  totalMonthlyYield(wallets: Wallet[], transactions: Transaction[]): number
  periodKey(ref: MonthRef): string
  closeDayFor(card: CreditCard, month: number, year: number): number
  addMonths(ref: MonthRef, n: number): MonthRef
  cardPeriod(card: CreditCard, date: ISODate): CardPeriod
  cmpPeriod(a: MonthRef, b: MonthRef): -1 | 0 | 1
  cardPeriodItems(card: CreditCard, transactions: Transaction[], month: number, year: number): CardLineItem[]
  cardPeriodTotal(card: CreditCard, transactions: Transaction[], month: number, year: number): number
  monthTransactions(transactions: Transaction[], month: number, year: number): Transaction[]
  countsInTotals(t: Transaction): boolean
  monthTotals(transactions: Transaction[], month: number, year: number): { income: number; expense: number }
  expensesByCategory(transactions: Transaction[], month: number, year: number): { category: string; amount: number }[]
  paymentLabel(walletId: string, wallets: Wallet[], cards: CreditCard[]): string
}

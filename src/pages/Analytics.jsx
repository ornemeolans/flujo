import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useStore, selectors } from '@/store'
import { MONTHS, MONTHS_SHORT, getCat, fmt, fmt2 } from '@/utils'
import { Button, Card, Section } from '@/components/ui'
import { useAiAvailable, aiRequest } from '@/sync/useAi'
import styles from './Analytics.module.css'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const COLORS = ['#178C9E','#A3296B','#C2A878','#2BB0C4','#D2559A','#3A6E8F','#7D5BA6','#C7754F','#4F9A7A','#B08D4F','#2E9E8A','#7F9496']

function MonthSummary({ month, year, income, expense, previousExpense, byCategory }) {
  const aiAvailable = useAiAvailable()
  const [result, setResult] = useState(null) // { key, summary }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!aiAvailable) return null

  // Si cambian el mes o los datos, el resumen anterior deja de valer
  const payload = {
    month: `${MONTHS[month]} ${year}`,
    income, expense, previousExpense,
    categories: byCategory.map(({ category, amount }) => ({ label: getCat(category).label, amount })),
  }
  const key = JSON.stringify(payload)
  const summary = result?.key === key ? result.summary : null

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const { summary } = await aiRequest('/ai/month-summary', payload)
      setResult({ key, summary })
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <Section title="Resumen del mes">
      <Card>
        {summary
          ? <p className={styles.aiSummary}>{summary}</p>
          : <p className={styles.aiHint}>Genera un resumen escrito con IA. Envía a Gemini, de Google, los totales y las categorías del mes, sin las descripciones de tus movimientos.</p>}
        {error && <p className={styles.aiError} role="alert">{error}</p>}
        {!summary && (
          <Button variant="ghost" size="md" onClick={generate} disabled={loading}>
            {loading ? 'Escribiendo…' : 'Generar resumen'}
          </Button>
        )}
      </Card>
    </Section>
  )
}

export default function Analytics() {
  const { transactions, wallets, cards, currentMonth, currentYear } = useStore()

  const monthTx = useMemo(
    () => selectors.monthTransactions(transactions, currentMonth, currentYear),
    [transactions, currentMonth, currentYear]
  )

  const { income, expense } = useMemo(
    () => selectors.monthTotals(transactions, currentMonth, currentYear),
    [transactions, currentMonth, currentYear]
  )

  const byCategory = useMemo(
    () => selectors.expensesByCategory(transactions, currentMonth, currentYear),
    [transactions, currentMonth, currentYear]
  )

  const pieData = byCategory.map(({ category, amount }) => ({
    name: getCat(category).label,
    value: amount,
    icon: getCat(category).icon,
  }))

  // Last 6 months bar
  const last6 = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      let m = currentMonth - (5 - i)
      let y = currentYear
      while (m < 0) { m += 12; y-- }
      const { expense } = selectors.monthTotals(transactions, m, y)
      return { label: MONTHS_SHORT[m], value: expense }
    })
  }, [transactions, currentMonth, currentYear])

  const maxBar = Math.max(...last6.map(d => d.value), 1)

  return (
    <div className="animate-fadeUp">
      {/* Month summary */}
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Ingresos</div>
          <div className={styles.summaryVal} style={{ color: 'var(--accent)' }}>{fmt2(income)}</div>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Egresos</div>
          <div className={styles.summaryVal} style={{ color: 'var(--red)' }}>{fmt2(expense)}</div>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Balance</div>
          <div className={styles.summaryVal} style={{ color: income - expense >= 0 ? 'var(--accent)' : 'var(--red)' }}>
            {fmt2(income - expense)}
          </div>
        </div>
      </div>

      {byCategory.length > 0 && (
        <MonthSummary
          month={currentMonth}
          year={currentYear}
          income={income}
          expense={expense}
          previousExpense={last6[4].value}
          byCategory={byCategory}
        />
      )}

      {/* Donut chart */}
      {byCategory.length > 0 && (
        <Section title="Egresos por categoría">
          <Card>
            <div className={styles.donutWrap}>
              {/* Decorativo: el desglose de abajo tiene los mismos datos como texto */}
              <div aria-hidden="true">
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={72} outerRadius={96}
                    paddingAngle={3}
                    cornerRadius={4}
                    stroke="none"
                    isAnimationActive={!reducedMotion}
                    rootTabIndex={-1}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: 'none', boxShadow: 'var(--shadow)', borderRadius: 12, fontFamily: 'var(--font-num)', fontSize: 12 }}
                    formatter={v => [`$${v.toLocaleString('es-AR')}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              </div>
              <div className={styles.donutCenter}>
                <div className={styles.donutTotal}>{fmt(expense)}</div>
                <div className={styles.donutLabel}>total</div>
              </div>
            </div>

            {/* Category breakdown */}
            <div className={styles.breakdown}>
              {byCategory.map(({ category, amount }, i) => {
                const cat  = getCat(category)
                const pct  = expense > 0 ? (amount / expense) * 100 : 0
                return (
                  <div key={category} className={styles.breakRow}>
                    <div className={styles.breakIcon}>{cat.icon}</div>
                    <div className={styles.breakBar}>
                      <div className={styles.breakMeta}>
                        <span>{cat.label}</span>
                        <span className={styles.breakAmt}>{fmt(amount)}</span>
                      </div>
                      <div className={styles.track}>
                        <div
                          className={styles.fill}
                          style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                    <div className={styles.breakPct}>{pct.toFixed(0)}%</div>
                  </div>
                )
              })}
            </div>
          </Card>
        </Section>
      )}

      {/* Last 6 months bar */}
      <Section title="Egresos, últimos 6 meses">
        <Card>
          <div className={styles.bars}>
            {last6.map((d, i) => (
              <div key={i} className={styles.barCol}>
                <div className={styles.barTrack}>
                  <div
                    className={`${styles.barFill} ${i === last6.length - 1 ? styles.barCurrent : ''}`}
                    style={{ height: `${(d.value / maxBar) * 100}%` }}
                  />
                </div>
                <div className={styles.barLabel}>{d.label}</div>
                {d.value > 0 && (
                  <div className={styles.barVal}>{fmt(d.value)}</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </Section>
    </div>
  )
}

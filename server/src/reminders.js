// ─── Recordatorios de vencimientos (notificaciones push) ─────
// Usa la misma lógica de dominio que la PWA (shared/, TypeScript que Node
// ejecuta directamente), así el servidor calcula las mismas fechas que ve el usuario.
import { loanDueDate, loanCuotaAmount } from '../../shared/loans.ts'
import { closeDateFor, periodKey, addMonths } from '../../shared/cards.ts'
import { addDays, todayIn } from '../../shared/dates.ts'

export const TIME_ZONE = 'America/Argentina/Buenos_Aires'
const SEND_HOUR = 9 // hora local a partir de la cual se envían los avisos del día

const fmt = n => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const longDate = iso => { const [, m, d] = iso.split('-'); return `${Number(d)} de ${MONTHS[Number(m) - 1]}` }

/**
 * Avisos que corresponden a `today` para los datos de un usuario.
 * - Préstamos: el día anterior al vencimiento de la próxima cuota.
 * - Tarjetas: 2 días antes del cierre del resumen.
 * Cada aviso tiene una `key` única para no enviarlo dos veces.
 */
export function computeReminders({ loans = [], cards = [], transactions = [] }, today) {
  const out = []
  const tomorrow = addDays(today, 1)

  // Según el cronograma (no según los débitos registrados: esos los genera la
  // PWA al abrirse, y quizás hace días que no se abre)
  for (const loan of loans) {
    for (let n = (loan.paidBefore || 0) + 1; n <= loan.cuotas; n++) {
      const due = loanDueDate(loan, n)
      if (due > tomorrow) break
      if (due !== tomorrow) continue
      const debited = transactions.some(t => t.loanId === loan.id && t.loanCuota === n)
      if (debited) continue
      out.push({
        key: `loan:${loan.id}:${n}`,
        title: `Mañana vence la cuota ${n}/${loan.cuotas}`,
        body: `${loan.name}: ${fmt(loanCuotaAmount(loan, n))}. Se debita de tu billetera.`,
        url: '/wallets',
      })
    }
  }

  const inTwoDays = addDays(today, 2)
  const [y, m] = today.split('-').map(Number)
  for (const card of cards) {
    // El cierre en 2 días puede caer en este mes o en el siguiente
    for (const ref of [{ month: m - 1, year: y }, addMonths({ month: m - 1, year: y }, 1)]) {
      if (closeDateFor(card, ref.month, ref.year) !== inTwoDays) continue
      out.push({
        key: `card:${card.id}:${periodKey(ref)}`,
        title: `${card.name} cierra en 2 días`,
        body: `El resumen cierra el ${longDate(inTwoDays)}. Revisá tus consumos.`,
        url: '/wallets',
      })
    }
  }
  return out
}

/**
 * Revisa todos los usuarios con notificaciones activas y envía los avisos del día.
 * `sendPush(subscription, payload)` debe rechazar con { statusCode } si falla.
 */
export async function runReminders({ db, sendPush, now = new Date() }) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(now))
  if (hour < SEND_HOUR) return { sent: 0 }
  const today = todayIn(TIME_ZONE, now)

  const users = db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all()
  const records = db.prepare('SELECT store, data FROM records WHERE user_id = ? AND deleted_at IS NULL AND store IN (\'loans\', \'cards\', \'transactions\')')
  const subsOf = db.prepare('SELECT endpoint, data FROM push_subscriptions WHERE user_id = ?')
  const wasSent = db.prepare('SELECT 1 FROM reminders_sent WHERE user_id = ? AND key = ?')
  const markSent = db.prepare('INSERT OR IGNORE INTO reminders_sent (user_id, key, sent_at) VALUES (?, ?, ?)')
  const dropSub = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')

  let sent = 0
  for (const { user_id: userId } of users) {
    const data = { loans: [], cards: [], transactions: [] }
    for (const r of records.all(userId)) data[r.store].push(JSON.parse(r.data))

    for (const reminder of computeReminders(data, today)) {
      if (wasSent.get(userId, reminder.key)) continue
      markSent.run(userId, reminder.key, Date.now()) // antes de enviar: nunca duplicar
      for (const sub of subsOf.all(userId)) {
        try {
          await sendPush(JSON.parse(sub.data), { title: reminder.title, body: reminder.body, url: reminder.url, tag: reminder.key })
          sent++
        } catch (e) {
          // 404/410: la suscripción ya no existe (desinstaló la app o revocó el permiso)
          if (e.statusCode === 404 || e.statusCode === 410) dropSub.run(sub.endpoint)
          else console.error('Push falló:', e.statusCode ?? e.message)
        }
      }
    }
  }
  return { sent }
}

export function startReminderScheduler(opts, everyMs = 10 * 60 * 1000) {
  const tick = () => runReminders(opts).catch(e => console.error('Recordatorios:', e))
  tick()
  return setInterval(tick, everyMs)
}

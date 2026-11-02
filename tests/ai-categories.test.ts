import { describe, expect, it } from 'vitest'
// @ts-expect-error el servidor es JS sin tipos
import { EXPENSE_CATEGORIES } from '../server/src/ai.js'
import { CATEGORIES } from '../src/utils'

describe('categorías de la IA', () => {
  it('son todas categorías existentes en la app', () => {
    const ids = CATEGORIES.map(c => c.id)
    for (const id of Object.keys(EXPENSE_CATEGORIES)) expect(ids).toContain(id)
  })
})

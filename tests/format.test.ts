import { describe, expect, it } from 'vitest'
import { fmt, fmt2 } from '@/utils'

describe('formato de montos', () => {
  it('muestra el signo de los saldos negativos', () => {
    expect(fmt2(-50_000)).toBe('-$50.000,00')
    expect(fmt(-1234.4)).toBe('-$1.234')
    expect(fmt2(1234.5)).toBe('$1.234,50')
  })

  it('no muestra "-$0" por un resto de redondeo', () => {
    expect(fmt2(-0.001)).toBe('$0,00')
    expect(fmt(-0.4)).toBe('$0')
    expect(fmt2(null)).toBe('$0,00')
  })
})

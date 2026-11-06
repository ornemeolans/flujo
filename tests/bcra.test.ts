import { describe, expect, it } from 'vitest'
import { buildEntities, cleanCardName, cleanEntityName, matchCard, matchEntity, searchEntities, cardDisplayName } from '@/bcra'
// Extracto real de las respuestas del Régimen de Transparencia (CajasAhorros y TarjetasCredito)
import fixture from './fixtures/bcra.json'

const entities = buildEntities(fixture.accounts, fixture.cards, fixture.loans)
const byName = (name: string) => entities.find(e => e.name === name)!

describe('lista de entidades del BCRA', () => {
  it('usa nombres cortos para las conocidas y limpia la razón social del resto', () => {
    expect(entities.map(e => e.name)).toEqual(expect.arrayContaining(['Mercado Pago', 'Banco Galicia', 'Banco Nación', 'Banco Provincia', 'BBVA', 'Ualá']))
    expect(cleanEntityName('BANCO MASVENTAS S.A.')).toBe('Banco Masventas')
    expect(cleanEntityName('BANCO CREDICOOP COOPERATIVO LIMITADO')).toBe('Banco Credicoop')
    expect(byName('Banco Galicia').legalName).toBe('BANCO DE GALICIA Y BUENOS AIRES S.A.')
  })

  it('pone primero las más usadas y distingue billeteras virtuales de bancos', () => {
    expect(entities[0].name).toBe('Mercado Pago')
    expect(byName('Mercado Pago').kind).toBe('virtual')
    expect(byName('Banco Galicia').kind).toBe('bank')
    const rest = entities.filter(e => e.rank === entities.at(-1)!.rank).map(e => e.name)
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'es')))
  })

  it('agrupa las tarjetas por entidad, sin repetidas y con nombres legibles', () => {
    const galicia = byName('Banco Galicia').cards.map(c => c.name)
    expect(galicia).toContain('Visa Gold')
    expect(new Set(galicia).size).toBe(galicia.length)
    expect(cleanCardName('000DVISA INTERNACIONAL', 'VISA INT')).toBe('Visa Internacional')
    expect(cleanCardName('MASTER INTER')).toBe('Mastercard Inter')
    expect(byName('Banco Galicia').cards.find(c => c.name === 'Visa Gold')?.tea).toBeGreaterThan(0)
  })

  it('busca sin importar tildes ni mayúsculas, también por alias', () => {
    expect(searchEntities(entities, 'nacion').map(e => e.name)).toContain('Banco Nación')
    expect(searchEntities(entities, 'MP').map(e => e.name)).toContain('Mercado Pago')
    expect(searchEntities(entities, 'uala').map(e => e.name)).toEqual(['Ualá'])
    expect(searchEntities(entities, '')).toHaveLength(entities.length)
  })
})

describe('préstamos personales', () => {
  it('marca quién da préstamos y separa bancos de financieras', () => {
    const go = searchEntities(entities, 'gocuotas')
    expect(go.map(e => e.name)).toEqual(['Finanzas Digitales (GOcuotas)'])
    expect(go[0]).toMatchObject({ kind: 'other', hasLoans: true, featured: false })
    expect(byName('Banco Galicia')).toMatchObject({ kind: 'bank', hasLoans: true })
    expect(byName('Mercado Pago')).toMatchObject({ kind: 'virtual', hasLoans: true })
  })
})

describe('vincular lo que ya está cargado', () => {
  it('reconoce la entidad por el nombre de la billetera', () => {
    expect(matchEntity('Mercado Pago', entities)?.name).toBe('Mercado Pago')
    expect(matchEntity('Cuenta sueldo Galicia', entities)?.name).toBe('Banco Galicia')
    expect(matchEntity('BNA', entities)?.name).toBe('Banco Nación')
    expect(matchEntity('Banco Provincia', entities)?.name).toBe('Banco Provincia')
    expect(matchEntity('Efectivo', entities)).toBeNull()
    expect(matchEntity('Ahorros para viajar', entities)).toBeNull()
  })

  it('reconoce el producto por el nombre de la tarjeta', () => {
    const galicia = byName('Banco Galicia')
    expect(matchCard('Visa Gold Galicia', galicia)?.name).toBe('Visa Gold')
    // Galicia tiene varias Visa: sin el nivel en el nombre no se adivina
    expect(matchCard('Visa Galicia', galicia)).toBeNull()
    expect(matchCard('Mastercard Mercado Pago', byName('Mercado Pago'))?.name).toMatch(/Mastercard/)
    expect(matchCard('Tarjeta de Galicia', galicia)).toBeNull()
    expect(matchCard('Visa Gold', null)).toBeNull()
  })

  it('arma el nombre de una tarjeta del catálogo', () => {
    expect(cardDisplayName('Visa Gold', byName('Banco Galicia'))).toBe('Visa Gold Galicia')
    expect(cardDisplayName('Mastercard', byName('Mercado Pago'))).toBe('Mastercard Mercado Pago')
  })
})

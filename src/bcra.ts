// Entidades financieras y sus tarjetas, del Régimen de Transparencia del BCRA.
// API pública, sin autenticación y con CORS abierto: la consulta la hace el navegador.
// Se guarda una copia local para elegir bancos sin conexión y no consultar en cada apertura.
// La API no informa la TNA de las cuentas ni las fechas de cierre de las tarjetas:
// esos datos los sigue cargando cada usuario.

const API = 'https://api.bcra.gob.ar/transparencia/v1.0'
const CACHE_KEY = 'flujo.bcra.v1'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const TIMEOUT = 15_000

export interface CardProduct {
  name: string
  segment?: string
  /** Tasa efectiva anual máxima de financiación (%) */
  tea?: number
}

export interface Entity {
  code: number
  /** Nombre corto para mostrar (ej: "Banco Galicia") */
  name: string
  /** Razón social informada por el BCRA */
  legalName: string
  kind: 'bank' | 'virtual'
  /** Orden de las más usadas; las demás van alfabéticamente después */
  rank: number
  aliases: string[]
  hasAccounts: boolean
  cards: CardProduct[]
}

export interface Catalog {
  entities: Entity[]
  savedAt: number
  /** true si no se pudo actualizar y se usa la copia guardada */
  stale?: boolean
}

// Las entidades más usadas: nombre corto, tipo y otras formas de escribirlas
const KNOWN: { match: RegExp; name: string; kind?: 'virtual'; aliases: string[] }[] = [
  { match: /MERCADOLIBRE|MERCADO PAGO/, name: 'Mercado Pago', kind: 'virtual', aliases: ['mercado pago', 'mercadopago', 'mercado libre', 'mp'] },
  { match: /GALICIA/, name: 'Banco Galicia', aliases: ['galicia'] },
  { match: /NACION ARGENTINA/, name: 'Banco Nación', aliases: ['banco nacion', 'nacion', 'bna'] },
  { match: /PROVINCIA DE BUENOS AIRES/, name: 'Banco Provincia', aliases: ['banco provincia', 'provincia', 'bapro'] },
  { match: /SANTANDER/, name: 'Santander', aliases: ['santander'] },
  { match: /BBVA/, name: 'BBVA', aliases: ['bbva', 'frances'] },
  { match: /MACRO/, name: 'Banco Macro', aliases: ['macro'] },
  { match: /CIUDAD DE BUENOS AIRES/, name: 'Banco Ciudad', aliases: ['banco ciudad', 'ciudad'] },
  { match: /UALA/, name: 'Ualá', kind: 'virtual', aliases: ['uala'] },
  { match: /BRUBANK/, name: 'Brubank', kind: 'virtual', aliases: ['brubank'] },
  { match: /NARANJA DIGITAL/, name: 'Naranja X', kind: 'virtual', aliases: ['naranja x', 'naranjax'] },
  { match: /TARJETA NARANJA/, name: 'Tarjeta Naranja', aliases: ['tarjeta naranja'] },
  { match: /SUPERVIELLE/, name: 'Supervielle', aliases: ['supervielle'] },
  { match: /PATAGONIA/, name: 'Banco Patagonia', aliases: ['patagonia'] },
  { match: /HIPOTECARIO/, name: 'Banco Hipotecario', aliases: ['hipotecario'] },
  { match: /CREDICOOP/, name: 'Banco Credicoop', aliases: ['credicoop'] },
  { match: /COMAFI/, name: 'Banco Comafi', aliases: ['comafi'] },
  { match: /REBA/, name: 'Reba', kind: 'virtual', aliases: ['reba'] },
]

const LEGAL_SUFFIX = /[\s,]*(S\.?\s?A\.?\s?U\.?|S\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|SOCIEDAD AN[OÓ]NIMA( UNIPERSONAL)?|COOPERATIVO LIMITADO|LIMITADA|LTDA\.?)\s*$/i
const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'para', 'el'])
const ACRONYMS = new Set(['BBVA', 'ICBC', 'HSBC', 'BICE', 'CMF', 'AMEX', 'PSA', 'RCI', 'GPAT', 'VW', 'GM', 'BMW', 'FCA', 'II', 'III'])
// Palabras que no sirven para reconocer una entidad dentro de un nombre
const GENERIC_WORDS = new Set(['banco', 'compania', 'financiera', 'tarjeta', 'tarjetas', 'mutual', 'asociacion', 'cooperativa', 'argentina', 'credito', 'creditos', 'sociedad', 'anonima', 'servicios', 'personal', 'nacional', 'buenos', 'aires', 'digital', 'provincia'])

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function titleCase(text: string): string {
  return text.trim().toLowerCase().split(/\s+/).map((word, i) => {
    if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase()
    if (i > 0 && SMALL_WORDS.has(word)) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  }).join(' ')
}

export function cleanEntityName(legalName: string): string {
  let name = legalName.trim()
  for (let i = 0; i < 3 && LEGAL_SUFFIX.test(name); i++) name = name.replace(LEGAL_SUFFIX, '')
  return titleCase(name)
}

/** "000DVISA INTERNACIONAL" → "Visa Internacional" */
export function cleanCardName(fullName: string, shortName = ''): string {
  const full = fullName.replace(/^\d{2,}[A-Z]?(?=[A-Z])/, '').trim()
  const name = full && full.length <= 40 ? full : shortName || full
  return titleCase(name.replace(/^MASTER\b(?!CARD)/i, 'Mastercard'))
}

interface RawItem {
  codigoEntidad: number
  descripcionEntidad: string
  nombreCompleto?: string
  nombreCorto?: string
  segmento?: string
  tasaEfectivaAnualMaximaFinanciacion?: number
}

/** Arma la lista de entidades a partir de las respuestas de la API */
export function buildEntities(accounts: RawItem[], cards: RawItem[]): Entity[] {
  const byCode = new Map<number, Entity>()
  const entityFor = (item: RawItem) => {
    let entity = byCode.get(item.codigoEntidad)
    if (!entity) {
      const legal = item.descripcionEntidad.trim()
      const upper = normalize(legal).toUpperCase()
      const knownIndex = KNOWN.findIndex(k => k.match.test(upper))
      const known = KNOWN[knownIndex]
      entity = {
        code: item.codigoEntidad,
        name: known?.name ?? cleanEntityName(legal),
        legalName: legal,
        kind: known?.kind ?? 'bank',
        rank: knownIndex >= 0 ? knownIndex : KNOWN.length,
        aliases: known?.aliases ?? [],
        hasAccounts: false,
        cards: [],
      }
      byCode.set(item.codigoEntidad, entity)
    }
    return entity
  }

  for (const item of accounts) entityFor(item).hasAccounts = true
  for (const item of cards) {
    const entity = entityFor(item)
    const name = cleanCardName(item.nombreCompleto ?? '', item.nombreCorto)
    if (!name || entity.cards.some(c => c.name === name)) continue
    entity.cards.push({ name, segment: item.segmento, tea: item.tasaEfectivaAnualMaximaFinanciacion })
  }

  for (const entity of byCode.values()) entity.cards.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return [...byCode.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'es'))
}

async function getResults(path: string): Promise<RawItem[]> {
  const res = await fetch(`${API}/${path}`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (res.status === 404) return [] // "No se encontraron datos para su consulta"
  if (!res.ok) throw new Error(`BCRA respondió ${res.status}`)
  const data = await res.json()
  return Array.isArray(data.results) ? data.results : []
}

function readCache(): Catalog | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    return cached?.entities?.length ? cached : null
  } catch { return null }
}

let pending: Promise<Catalog> | null = null

/** Lista de entidades: la guardada si es reciente; si no, la consulta al BCRA */
export function loadCatalog({ force = false } = {}): Promise<Catalog> {
  const cached = readCache()
  if (!force && cached && Date.now() - cached.savedAt < CACHE_TTL) return Promise.resolve(cached)
  pending ??= (async () => {
    try {
      const [accounts, cards] = await Promise.all([getResults('CajasAhorros'), getResults('TarjetasCredito')])
      const catalog: Catalog = { entities: buildEntities(accounts, cards), savedAt: Date.now() }
      if (!catalog.entities.length) throw new Error('El BCRA no devolvió entidades')
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(catalog)) } catch { /* sin espacio: se usa igual */ }
      return catalog
    } catch (e) {
      if (cached) return { ...cached, stale: true }
      throw new Error(navigator.onLine ? 'No se pudo cargar la lista del BCRA. Probá más tarde.' : 'Necesitás conexión para cargar la lista de bancos la primera vez.', { cause: e })
    } finally {
      pending = null
    }
  })()
  return pending
}

/** Búsqueda sin tildes ni mayúsculas, por nombre corto, razón social o alias */
export function searchEntities(entities: Entity[], query: string): Entity[] {
  const q = normalize(query.trim())
  if (!q) return entities
  return entities.filter(e => normalize(`${e.name} ${e.legalName} ${e.aliases.join(' ')}`).includes(q))
}

const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text)

/** Sugiere la entidad de una billetera o tarjeta cargada a mano, por su nombre */
export function matchEntity(text: string, entities: Entity[]): Entity | null {
  const t = normalize(text)
  let best: { entity: Entity; score: number } | null = null
  for (const entity of entities) {
    const words = normalize(entity.name).split(/\s+/).filter(w => w.length >= 4 && !GENERIC_WORDS.has(w))
    for (const alias of [...entity.aliases, ...words]) {
      if (!hasWord(t, alias)) continue
      // Gana el alias más largo; a igual largo, la entidad más usada
      const score = alias.length * 100 - entity.rank
      if (!best || score > best.score) best = { entity, score }
    }
  }
  return best?.entity ?? null
}

const BRANDS = ['visa', 'mastercard', 'master', 'american express', 'amex', 'cabal', 'naranja']
const TIERS = ['signature', 'infinite', 'black', 'platinum', 'gold', 'internacional', 'nacional', 'classic']

/** Sugiere el producto (ej: "Visa Gold") a partir del nombre de una tarjeta */
export function matchCard(text: string, entity: Entity | null): CardProduct | null {
  if (!entity?.cards.length) return null
  const t = normalize(text)
  const brand = BRANDS.find(b => hasWord(t, b))
  if (!brand) return null
  const family = brand === 'master' || brand === 'mastercard' ? 'master' : brand === 'amex' || brand === 'american express' ? 'amex|american' : brand
  const sameBrand = entity.cards.filter(c => new RegExp(family).test(normalize(c.name)))
  const tier = TIERS.find(x => hasWord(t, x))
  if (tier) return sameBrand.find(c => normalize(c.name).includes(tier)) ?? null
  // Sin el nivel en el nombre solo se sugiere si no hay dudas: una única tarjeta de esa marca
  return sameBrand.length === 1 ? sameBrand[0] : null
}

/** Nombre para una tarjeta del catálogo: "Visa Gold Galicia" */
export const cardDisplayName = (product: string, entity: Pick<Entity, 'name'>) =>
  `${product} ${entity.name.replace(/^Banco /, '')}`

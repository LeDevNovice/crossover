import { XMLParser } from 'fast-xml-parser'
import { parseToIsbn13, type Isbn13 } from '../isbn-parser.ts'

export type BibLevel = 'monograph' | 'serial' | 'collection' | 'unknown'

export interface Creator {
  name: string
  isni: string | null
  role: string | null
}

export interface BnfAlbum {
  ark: string
  bibLevel: BibLevel
  issn: string | null
  isbn13: Isbn13 | null
  rawIsbn: string | null
  title: string
  subtitle: string | null
  volume: string | null
  voTitles: string[]
  originalLanguage: string | null
  creators: Creator[]
  pages: number | null
  pagesApproximate: boolean
  year: number | null
  publishers: string[]
  collections: string[]
  seriesLink: { title: string; volume: string | null } | null
}

export interface CatalogPage {
  total: number
  nextPosition: number | null
  albums: BnfAlbum[]
}

const UNIMARC_TAG = {
  Isbn: '010',
  Issn: '011',
  Ean: '073',
  ProcessingData: '100',
  Language: '101',
  Title: '200',
  Publication: '210',
  PublicationModern: '214',
  PhysicalDescription: '215',
  Collection: '225',
  OriginalTitle: '454',
  SeriesLink: '461',
  CreatorPrimary: '700',
  CreatorAlternative: '701',
  CreatorSecondary: '702',
} as const

interface RawSubfield {
  '@_code': string
  '#text'?: string | number
}

interface RawDatafield {
  '@_tag': string
  subfield?: RawSubfield[]
}

export interface RawMarcRecord {
  '@_id'?: string
  leader?: string
  datafield?: RawDatafield[]
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ['record', 'datafield', 'subfield'].includes(name),
})

const findDatafields = (record: RawMarcRecord, tag: string): RawDatafield[] =>
  (record.datafield ?? []).filter((field) => field['@_tag'] === tag)

const extractSubfieldValues = (field: RawDatafield, code: string): string[] =>
  (field.subfield ?? [])
    .filter((sub) => sub['@_code'] === code)
    .map((sub) => String(sub['#text'] ?? '').trim())
    .filter((text) => text.length > 0)

const getFirstSubfield = (record: RawMarcRecord, tag: string, code: string): string | null => {
  for (const field of findDatafields(record, tag)) {
    const value = extractSubfieldValues(field, code)[0]
    if (value) return value
  }
  return null
}

const getAllSubfields = (record: RawMarcRecord, tag: string, code: string): string[] =>
  findDatafields(record, tag).flatMap((field) => extractSubfieldValues(field, code))

const PAGINATION_PATTERN = /\[?\s*(?:ca\s*)?(\d+)\s*\]?\s*p\./i
const APPROXIMATE_PAGINATION_PATTERN = /non pagin|\bca\b|\[/i

export const extractPagination = (
  rawDescription: string | null,
): { pages: number | null; approximate: boolean } => {
  if (!rawDescription) return { pages: null, approximate: false }

  const match = PAGINATION_PATTERN.exec(rawDescription)
  if (!match?.[1]) return { pages: null, approximate: false }

  const isApproximate = APPROXIMATE_PAGINATION_PATTERN.test(rawDescription)
  return { pages: Number(match[1]), approximate: isApproximate }
}

export const extractBibLevel = (leader: string | undefined): BibLevel => {
  const levelCode = leader?.charAt(7)
  switch (levelCode) {
    case 'm':
      return 'monograph'
    case 's':
      return 'serial'
    case 'c':
      return 'collection'
    default:
      return 'unknown'
  }
}

const extractPublicationYear = (rawProcessingData: string | null): number | null => {
  const yearStr = rawProcessingData?.slice(9, 13)
  return yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : null
}

const ISNI_CLEANUP_PATTERN = /^ISNI/i
const ISNI_VALIDATION_PATTERN = /^\d{15}[\dX]$/

const extractCreators = (record: RawMarcRecord): Creator[] => {
  const creatorTags = [
    UNIMARC_TAG.CreatorPrimary,
    UNIMARC_TAG.CreatorAlternative,
    UNIMARC_TAG.CreatorSecondary,
  ]

  return creatorTags.flatMap((tag) =>
    findDatafields(record, tag).map((field) => {
      const surname = extractSubfieldValues(field, 'a')[0] ?? ''
      const forename = extractSubfieldValues(field, 'b')[0]

      const rawIsni = extractSubfieldValues(field, 'o')
        .map((o) => o.replace(ISNI_CLEANUP_PATTERN, ''))
        .find((o) => ISNI_VALIDATION_PATTERN.test(o))

      return {
        name: forename ? `${forename} ${surname}` : surname,
        isni: rawIsni ?? null,
        role: extractSubfieldValues(field, '4')[0] ?? null,
      }
    }),
  )
}

export const mapMarcRecordToAlbum = (record: RawMarcRecord): BnfAlbum => {
  const rawIsbn =
    getFirstSubfield(record, UNIMARC_TAG.Isbn, 'a') ??
    getFirstSubfield(record, UNIMARC_TAG.Ean, 'a')
  const pagination = extractPagination(
    getFirstSubfield(record, UNIMARC_TAG.PhysicalDescription, 'a'),
  )
  const seriesTitle = getFirstSubfield(record, UNIMARC_TAG.SeriesLink, 't')

  return {
    ark: record['@_id'] ?? '',
    bibLevel: extractBibLevel(record.leader),
    issn: getFirstSubfield(record, UNIMARC_TAG.Issn, 'a'),
    isbn13: parseToIsbn13(rawIsbn),
    rawIsbn,
    title: getFirstSubfield(record, UNIMARC_TAG.Title, 'a') ?? '',
    subtitle:
      getFirstSubfield(record, UNIMARC_TAG.Title, 'e') ??
      getFirstSubfield(record, UNIMARC_TAG.Title, 'i'),
    volume: getFirstSubfield(record, UNIMARC_TAG.Title, 'h'),
    voTitles: getAllSubfields(record, UNIMARC_TAG.OriginalTitle, 't'),
    originalLanguage: getFirstSubfield(record, UNIMARC_TAG.Language, 'c'),
    creators: extractCreators(record),
    pages: pagination.pages,
    pagesApproximate: pagination.approximate,
    year: extractPublicationYear(getFirstSubfield(record, UNIMARC_TAG.ProcessingData, 'a')),
    publishers: [
      ...getAllSubfields(record, UNIMARC_TAG.Publication, 'c'),
      ...getAllSubfields(record, UNIMARC_TAG.PublicationModern, 'c'),
    ],
    collections: getAllSubfields(record, UNIMARC_TAG.Collection, 'a'),
    seriesLink: seriesTitle
      ? { title: seriesTitle, volume: getFirstSubfield(record, UNIMARC_TAG.SeriesLink, 'v') }
      : null,
  }
}

export const parseSruPage = (xmlString: string): CatalogPage => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = xmlParser.parse(xmlString) as any
  const response = document?.searchRetrieveResponse

  if (!response) {
    throw new Error('Invalid XML: Expected SRU searchRetrieveResponse payload.')
  }

  const rawRecords: RawMarcRecord[] = (response.records?.record ?? []).flatMap(
    (r: any) => r.recordData?.record ?? [],
  )

  const nextPositionRaw = response.nextRecordPosition
  const parsedNextPosition = nextPositionRaw ? Number(nextPositionRaw) : null

  return {
    total: Number(response.numberOfRecords ?? 0),
    nextPosition: Number.isFinite(parsedNextPosition) ? parsedNextPosition : null,
    albums: rawRecords.map(mapMarcRecordToAlbum),
  }
}

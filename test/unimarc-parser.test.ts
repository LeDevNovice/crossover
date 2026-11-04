import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractBibLevel, extractPagination, parseSruPage } from '../src/bnf/unimarc-parser.ts'

const MOCK_XML_PATH = 'test/fixtures/bnf/sru-page.xml'
const rawXmlPayload = readFileSync(MOCK_XML_PATH, 'utf8')
const parsedCatalogPage = parseSruPage(rawXmlPayload)

const getAlbumByArk = (arkId: string) => {
  const album = parsedCatalogPage.albums.find((a) => a.ark === arkId)
  if (!album) {
    throw new Error(`Fixture corruption: Album '${arkId}' is missing from the XML mock.`)
  }
  return album
}

describe('parseSruPage (Integration with BnF UNIMARC format)', () => {
  it('correctly identifies the volume of the SRU page', () => {
    expect(parsedCatalogPage.total).toBe(3)
    expect(parsedCatalogPage.albums).toHaveLength(3)
  })

  describe('Extraction of a complete and rich record (e.g., Mister Miracle)', () => {
    const completeAlbum = getAlbumByArk('ark:/12148/cb47431324t')

    it('extracts the main editorial metadata', () => {
      expect(completeAlbum.title).toBe('Mister Miracle')
      expect(completeAlbum.bibLevel).toBe('monograph')
      expect(completeAlbum.isbn13).toBe('9791026828747')
      expect(completeAlbum.year).toBe(2024)
      expect(completeAlbum.originalLanguage).toBe('eng')
      expect(completeAlbum.publishers).toContain('Urban comics')
    })

    it('extracts the exact pagination', () => {
      expect(completeAlbum.pages).toBe(299)
      expect(completeAlbum.pagesApproximate).toBe(false)
    })

    it('isolates and cleans up creators with their roles and international identifiers (ISNI)', () => {
      expect(completeAlbum.creators).toContainEqual({
        name: 'Tom King',
        isni: expect.stringMatching(/^\d{15}[\dX]$/),
        role: '070',
      })
    })
  })

  describe('Graceful handling of partial records (e.g., Danger street)', () => {
    const partialAlbum = getAlbumByArk('ark:/12148/cb48810151b')

    it('returns null/empty values by default rather than inventing data', () => {
      expect(partialAlbum.title).toBe('Danger street')
      expect(partialAlbum.pages).toBeNull()
      expect(partialAlbum.voTitles).toEqual([])

      const hasNoRoles = partialAlbum.creators.every((creator) => creator.role === null)
      expect(hasNoRoles).toBe(true)
    })
  })

  it('guarantees legal compliance (Open Licence) by purging Electre summaries', () => {
    for (const album of parsedCatalogPage.albums) {
      expect(JSON.stringify(album)).not.toMatch(/Electre/i)
    }
  })
})

describe('extractPagination (Business logic for physical description subfield)', () => {
  it.each([
    ['standard pagination', '1 vol. (299 p.)', 299, false],
    ['explicit approximate pagination', '1 vol. (non paginé [ca 220] p.)', 220, true],
    ['bracket-inferred approximate pagination', '1 vol. (non paginé [72] p.)', 72, true],
  ])('parses a %s: "%s"', (_, rawInput, expectedPages, expectedApprox) => {
    expect(extractPagination(rawInput)).toEqual({
      pages: expectedPages,
      approximate: expectedApprox,
    })
  })

  it.each([
    ['without page count', '1 vol.'],
    ['with a null value', null],
  ])('returns null for a %s format: "%s"', (_, rawInput) => {
    expect(extractPagination(rawInput)).toEqual({ pages: null, approximate: false })
  })
})

describe('extractBibLevel (UNIMARC Leader Analysis)', () => {
  it.each([
    ['monograph (m)', '     cam  22        450 ', 'monograph'],
    ['serial (s)', '     cas  22        450 ', 'serial'],
    ['collection (c)', '     cac  22        450 ', 'collection'],
  ])('identifies a %s from position 7', (_, leaderString, expectedLevel) => {
    expect(extractBibLevel(leaderString)).toBe(expectedLevel)
  })

  it('returns "unknown" if position 7 is unreadable or the string is undefined', () => {
    expect(extractBibLevel('     cax  22        450 ')).toBe('unknown')
    expect(extractBibLevel(undefined)).toBe('unknown')
  })
})

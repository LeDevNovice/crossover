import { describe, expect, it } from 'vitest'
import { parseToIsbn13 } from '../src/isbn-parser.ts'

describe('parseToIsbn13', () => {
  describe('ISBN-13 validations and formatting', () => {
    it.each([
      ['standard hyphenated format (979)', '979-10-268-2874-7', '9791026828747'],
      ['atypical hyphenation format', '979-1-0268-2643-9', '9791026826439'],
      ['raw format (no separators)', '9791026828747', '9791026828747'],
      ['space-separated format', '978 2 914 082 99 0', '9782914082990'],
    ])('accepts a %s (%s) and returns the canonical form', (_, input, expected) => {
      expect(parseToIsbn13(input)).toBe(expected)
    })
  })

  describe('ISBN-10 to ISBN-13 conversions', () => {
    it.each([
      ['standard hyphenated', '2-914082-99-1', '9782914082990'],
      ['with an uppercase X check digit', '0-8044-2957-X', '9780804429573'],
      ['with a lowercase x check digit', '0-8044-2957-x', '9780804429573'],
      ['raw without separators', '2914082991', '9782914082990'],
    ])('converts a %s ISBN-10 (%s) to a canonical ISBN-13', (_, input, expected) => {
      expect(parseToIsbn13(input)).toBe(expected)
    })
  })

  describe('Rejections due to mathematical invalidity (wrong check digits)', () => {
    it.each([
      ['ISBN-13 with wrong check digit', '979-10-268-2874-8'],
      ['ISBN-10 with wrong check digit', '2-914082-99-2'],
    ])('silently rejects an %s (%s)', (_, input) => {
      expect(parseToIsbn13(input)).toBeNull()
    })
  })

  describe('Rejections due to structural invalidity or unexpected types', () => {
    it.each([
      ['an empty string', ''],
      ['a null value', null],
      ['an undefined value', undefined],
      ['a non-ISBN string (text)', 'br.'],
      ['a 13-digit number not starting with 978/979', '1234567890123'],
      ['a string that is too short (9 digits)', '123456789'],
      ['a string that is too long', '97829140829901'],
    ])('returns null for %s (%s)', (_, input) => {
      expect(parseToIsbn13(input as string | null | undefined)).toBeNull()
    })
  })
})

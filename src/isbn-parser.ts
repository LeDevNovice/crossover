export type Isbn13 = string & { readonly __brand: unique symbol }

const ISBN10_LENGTH = 10
const ISBN13_LENGTH = 13
const ISBN13_PREFIX = '978'

const INVALID_CHARS_PATTERN = /[^0-9xX]/g
const ISBN13_FORMAT_PATTERN = /^97[89]\d{10}$/
const ISBN10_FORMAT_PATTERN = /^\d{9}[\dX]$/

const stripIsbnFormatting = (rawString: string): string =>
  rawString.replace(INVALID_CHARS_PATTERN, '').toUpperCase()

const calculateIsbn10CheckDigit = (baseDigits: string): string => {
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number(baseDigits[i]) * (10 - i)
  }
  const remainder = sum % 11
  const check = (11 - remainder) % 11
  return check === 10 ? 'X' : String(check)
}

const calculateIsbn13CheckDigit = (baseDigits: string): string => {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(baseDigits[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const remainder = sum % 10
  return String((10 - remainder) % 10)
}

export const parseToIsbn13 = (rawInput: string | null | undefined): Isbn13 | null => {
  if (!rawInput) return null

  const cleanedInput = stripIsbnFormatting(rawInput)

  if (cleanedInput.length === ISBN13_LENGTH && ISBN13_FORMAT_PATTERN.test(cleanedInput)) {
    const baseDigits = cleanedInput.slice(0, 12)
    const providedCheckDigit = cleanedInput[12]

    return calculateIsbn13CheckDigit(baseDigits) === providedCheckDigit
      ? (cleanedInput as Isbn13)
      : null
  }

  if (cleanedInput.length === ISBN10_LENGTH && ISBN10_FORMAT_PATTERN.test(cleanedInput)) {
    const baseDigits = cleanedInput.slice(0, 9)
    const providedCheckDigit = cleanedInput[9]

    if (calculateIsbn10CheckDigit(baseDigits) !== providedCheckDigit) {
      return null
    }

    const convertedBaseDigits = `${ISBN13_PREFIX}${baseDigits}`
    const newCheckDigit = calculateIsbn13CheckDigit(convertedBaseDigits)

    return `${convertedBaseDigits}${newCheckDigit}` as Isbn13
  }

  return null
}

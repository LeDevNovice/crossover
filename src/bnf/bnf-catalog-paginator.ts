import { parseSruPage, type BnfAlbum } from './unimarc-parser.ts' // Supposant que unimarc.ts a aussi été renommé

export const BNF_SRU_ENDPOINT = 'https://catalogue.bnf.fr/api/SRU'

const SRU_API_VERSION = '1.2'
const SRU_OPERATION = 'searchRetrieve'
const SRU_RECORD_SCHEMA = 'unimarcxchange'
const DEFAULT_RECORDS_PER_PAGE = 100

export type SruDataFetcher = (targetUrl: string) => Promise<{ body: string; fromCache: boolean }>

export interface CatalogPaginationResult {
  totalRecords: number
  albums: BnfAlbum[]
  fromCache: boolean
}

export const buildBnfCatalogUrl = (
  searchQuery: string,
  startPosition: number,
  recordsPerPage: number,
): string => {
  const queryParams = new URLSearchParams({
    version: SRU_API_VERSION,
    operation: SRU_OPERATION,
    query: searchQuery,
    recordSchema: SRU_RECORD_SCHEMA,
    maximumRecords: String(recordsPerPage),
    startRecord: String(startPosition),
  })

  return `${BNF_SRU_ENDPOINT}?${queryParams.toString()}`
}

export async function* paginateBnfCatalog(
  fetchData: SruDataFetcher,
  searchQuery: string,
  recordsPerPage: number = DEFAULT_RECORDS_PER_PAGE,
): AsyncGenerator<CatalogPaginationResult, void, unknown> {
  let currentPosition: number | null = 1

  while (currentPosition !== null) {
    const targetUrl = buildBnfCatalogUrl(searchQuery, currentPosition, recordsPerPage)

    const { body: rawXmlData, fromCache } = await fetchData(targetUrl)
    const catalogPage = parseSruPage(rawXmlData)

    yield {
      totalRecords: catalogPage.total,
      albums: catalogPage.albums,
      fromCache,
    }

    const containsRecords = catalogPage.albums.length > 0
    currentPosition = containsRecords ? catalogPage.nextPosition : null
  }
}

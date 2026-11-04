import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export const USER_AGENT = 'crossover-feasibility/0.1'

const CACHE_FILE_EXTENSION = '.cache'
const HASH_ALGORITHM = 'sha1'
const FILE_NOT_FOUND_CODE = 'ENOENT'
const BASE_BACKOFF_DELAY_MS = 1000

export interface CachedFetcherOptions {
  cacheDir: string
  minIntervalMs: number
  maxAttempts?: number
}

export interface FetcherResponse {
  body: string
  fromCache: boolean
}

export abstract class HttpError extends Error {
  readonly statusCode: number
  readonly requestedUrl: string

  constructor(statusCode: number, requestedUrl: string, message: string) {
    super(message)
    this.statusCode = statusCode
    this.requestedUrl = requestedUrl
    this.name = this.constructor.name
  }
}

export class PermanentHttpError extends HttpError {
  constructor(statusCode: number, requestedUrl: string) {
    super(statusCode, requestedUrl, `Permanent HTTP ${statusCode} for ${requestedUrl}`)
  }
}

export class MaxAttemptsExceededError extends HttpError {
  constructor(statusCode: number, requestedUrl: string, attempts: number) {
    super(
      statusCode,
      requestedUrl,
      `HTTP ${statusCode} after ${attempts} attempts: ${requestedUrl}`,
    )
  }
}

export const createCachedFetcher = ({
  cacheDir,
  minIntervalMs,
  maxAttempts = 4,
}: CachedFetcherOptions) => {
  let nextAllowedRequestAt = Date.now()
  let isCacheDirEnsured = false

  const ensureCacheDirectory = async (): Promise<void> => {
    if (isCacheDirEnsured) return
    await mkdir(cacheDir, { recursive: true })
    isCacheDirEnsured = true
  }

  const getCacheFilePath = (targetUrl: string): string => {
    const hash = createHash(HASH_ALGORITHM).update(targetUrl).digest('hex')
    return join(cacheDir, `${hash}${CACHE_FILE_EXTENSION}`)
  }

  const enforcePoliteRateLimit = async (): Promise<void> => {
    const now = Date.now()
    const waitTime = Math.max(0, nextAllowedRequestAt - now)

    nextAllowedRequestAt = now + waitTime + minIntervalMs

    if (waitTime > 0) {
      await sleep(waitTime)
    }
  }

  const isTransientStatus = (status: number): boolean => status === 429 || status >= 500

  const executeNetworkRequest = async (targetUrl: string): Promise<string> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await enforcePoliteRateLimit()

      try {
        const response = await fetch(targetUrl, { headers: { 'User-Agent': USER_AGENT } })

        if (response.ok) {
          return await response.text()
        }

        if (!isTransientStatus(response.status)) {
          throw new PermanentHttpError(response.status, targetUrl)
        }

        if (attempt === maxAttempts) {
          throw new MaxAttemptsExceededError(response.status, targetUrl, attempt)
        }
      } catch (error: unknown) {
        if (error instanceof HttpError) throw error
        if (attempt === maxAttempts) throw error
      }

      const backoffDelay = BASE_BACKOFF_DELAY_MS * 2 ** attempt
      await sleep(backoffDelay)
    }

    throw new Error('Unreachable code in retry loop')
  }

  return async (targetUrl: string): Promise<FetcherResponse> => {
    await ensureCacheDirectory()

    const cacheFilePath = getCacheFilePath(targetUrl)

    try {
      const cachedBody = await readFile(cacheFilePath, 'utf8')
      return { body: cachedBody, fromCache: true }
    } catch (error: unknown) {
      const isFileNotFound =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === FILE_NOT_FOUND_CODE

      if (!isFileNotFound) {
        throw error
      }
    }

    const networkBody = await executeNetworkRequest(targetUrl)
    await writeFile(cacheFilePath, networkBody)

    return { body: networkBody, fromCache: false }
  }
}

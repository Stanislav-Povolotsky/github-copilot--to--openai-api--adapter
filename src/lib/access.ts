import fs from "node:fs/promises"
import path from "node:path"
import consola from "consola"

import { PATHS } from "~/lib/paths"

let accessKeys: Set<string> = new Set()

export const loadAccessFile = async (filePath?: string): Promise<void> => {
  const fullPath = filePath ?? path.join(PATHS.APP_DIR, "access.txt")
  try {
    const raw = await fs.readFile(fullPath, "utf8")
    const lines = raw
        .split(/\r?\n/)
        .map((l: string) => l.trim())
    accessKeys = new Set(lines.filter((l: string) => (
        l.length > 0  && !l.startsWith("#") && !l.startsWith("//"))))
    consola.info(`Loaded ${accessKeys.size} access keys from ${fullPath}`)
    if (accessKeys.size === 0) {
      consola.warn(`No access keys found in ${fullPath}; all requests will be denied`)
    }
  } catch (err) {
    // If the file does not exist, treat as empty list (no keys)
    consola.warn(`Could not load access file at ${fullPath}: ${err}`)
    accessKeys = new Set()
  }
}

export const hasAccessKey = (key?: string): boolean => {
  if (!key) return false
  return accessKeys.has(key) || accessKeys.has('*')
}

// Hono Context type is not imported here to avoid circular deps; accept any
export const requireAccess = async (c: any) => {
    // If request is for root path "/", skip auth checks
    let pathname: string | undefined = undefined
    try {
        const rawUrl =
            (c.req && (c.req.url as string)) ||
            (c.request && (c.request.url as string)) ||
            (c.raw && (c.raw.url as string)) ||
            undefined

        if (typeof rawUrl === "string") {
            try {
                pathname = new URL(rawUrl, "http://example").pathname
            } catch {
                if (rawUrl.startsWith("/")) pathname = rawUrl
            }
        }

        // Try framework helpers or other shapes
        if (!pathname) {
            const maybePath =
                (typeof c.path === "function" ? c.path() : undefined) ||
                (c.req && typeof (c.req as any).path === "function" ? (c.req as any).path() : undefined) ||
                (c.request && typeof (c.request as any).path === "function" ? (c.request as any).path() : undefined) ||
                (c.path as string | undefined)
            if (typeof maybePath === "string") pathname = maybePath
        }
    } catch {
        /* noop */
    }

    if (pathname === "/") return undefined

    // Support multiple header shapes: Headers (with .get) or plain object
    const auth = c.req.header('Authorization')
    if (!auth) return c.text("Missing Authorization header", 401)

    const m = auth.match(/^Bearer\s+(.+)$/i)
    const token = m ? m[1] : undefined
    if (!hasAccessKey(token)) return c.text("Invalid access token", 403)

    return undefined
}

export const _test__reset = (): void => {
  accessKeys = new Set()
}

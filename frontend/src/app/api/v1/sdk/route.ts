import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The SDK is emitted by `pnpm run sdk:build` into
// `frontend/src/_sovads_sdk/`. On Vercel the compiled output ships with the
// serverless bundle (see `outputFileTracingIncludes` in next.config.ts),
// so we look up the bundle relative to `process.cwd()` (the Next server
// root) first, then fall back to the local sibling `../sdk/dist/index.js`
// used by developers who prefer running `pnpm --filter sdk build` alone.
const SDK_CANDIDATES = [
    () => path.join(process.cwd(), 'src', '_sovads_sdk', 'index.js'),
    () => path.join(process.cwd(), 'frontend', 'src', '_sovads_sdk', 'index.js'),
    () => path.resolve(process.cwd(), '../sdk/dist/index.js'),
]

function resolveSdkPath(): string | null {
    for (const build of SDK_CANDIDATES) {
        const candidate = build()
        try {
            if (fs.existsSync(candidate)) return candidate
        } catch {
            // ignore and try the next candidate
        }
    }
    return null
}

export async function GET(_request: NextRequest) {
    try {
        const sdkPath = resolveSdkPath()

        if (!sdkPath) {
            return new NextResponse(
                'SDK bundle not found. Run `pnpm run sdk:build` in the frontend directory.',
                { status: 404 },
            )
        }

        const sdkContent = fs.readFileSync(sdkPath, 'utf8')

        return new NextResponse(sdkContent, {
            headers: {
                'Content-Type': 'application/javascript; charset=utf-8',
                // CDN-cacheable: bundle content is immutable per deploy.
                'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
                'Access-Control-Allow-Origin': '*',
            },
        })
    } catch (error) {
        console.error('Error serving SDK:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}

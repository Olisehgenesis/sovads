import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
    try {
        // Path to the SDK dist file
        // Adjust path based on your local setup if necessary
        const sdkPath = path.resolve(process.cwd(), '../sdk/dist/index.js')

        if (!fs.existsSync(sdkPath)) {
            return new NextResponse('SDK file not found. Please run "pnpm run build" in the sdk directory.', { status: 404 })
        }

        const sdkContent = fs.readFileSync(sdkPath, 'utf8')

        return new NextResponse(sdkContent, {
            headers: {
                'Content-Type': 'application/javascript',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
        })
    } catch (error) {
        console.error('Error serving SDK:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}

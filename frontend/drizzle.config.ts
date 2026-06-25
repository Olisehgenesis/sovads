import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/turso/schema.ts',
  out: './drizzle/turso',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_URL!,
    authToken: process.env.TURSO_TOKEN!,
  },
  verbose: true,
  strict: true,
} satisfies Config

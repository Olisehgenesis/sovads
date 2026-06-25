import type { source } from '@/lib/source'

type DocPage = ReturnType<typeof source.getPages>[number]

/**
 * Returns the raw markdown/MDX content of a docs page, prefixed with a title
 * and the canonical URL. Used by the per-page `Copy as Markdown` button and
 * by `/llms.txt`-style routes.
 */
export async function getLLMText(page: DocPage): Promise<string> {
  const data = page.data as {
    title?: string
    description?: string
    // fumadocs-mdx attaches getText at runtime; types vary by version
    getText?: (type: 'raw' | 'processed') => Promise<string>
  }

  let body = ''
  if (typeof data.getText === 'function') {
    try {
      body = await data.getText('raw')
    } catch {
      body = ''
    }
  }

  const header = `# ${data.title ?? page.url} (${page.url})`
  const desc = data.description ? `\n\n> ${data.description}` : ''
  return `${header}${desc}\n\n${body}`.trim() + '\n'
}

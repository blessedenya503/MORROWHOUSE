const staticPages = [
  ['/', 'daily', '1.0'],
  ['/shop', 'daily', '0.9'],
  ['/contact', 'monthly', '0.5'],
  ['/shipping', 'monthly', '0.4'],
  ['/refunds', 'monthly', '0.4'],
  ['/privacy', 'yearly', '0.3'],
  ['/terms', 'yearly', '0.3'],
]

export function getSitemapBaseUrl(configuredBaseUrl) {
  const fallback = 'https://morrowhouse.vercel.app'
  if (!configuredBaseUrl) return fallback

  try {
    const url = new URL(configuredBaseUrl)
    if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname.endsWith('.local') || url.hostname === '127.0.0.1' || url.hostname === '::1') {
      return fallback
    }
    return url.origin
  } catch {
    return fallback
  }
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character])
}

export function buildSitemapXml(baseUrl, products) {
  const origin = new URL(baseUrl).origin
  const urls = [
    ...staticPages.map(([path, changefreq, priority]) => ({ path, changefreq, priority })),
    ...products
      .filter((product) => product?.is_active !== false && product?.id != null && String(product.id).trim())
      .map((product) => ({ path: `/product/${encodeURIComponent(String(product.id))}`, changefreq: 'weekly', priority: '0.8' })),
  ]

  const entries = urls.map(({ path, changefreq, priority }) => `  <url>
    <loc>${escapeXml(new URL(path, origin).href)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}

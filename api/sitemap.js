import { getStoreProducts } from '../server.js'
import { buildSitemapXml, getSitemapBaseUrl } from '../services/sitemap.js'

export default async function sitemap(_request, response) {
  try {
    const products = await getStoreProducts()
    const baseUrl = getSitemapBaseUrl(process.env.APP_URL)
    response
      .setHeader('Content-Type', 'application/xml; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600')
    response.status(200).send(buildSitemapXml(baseUrl, products))
  } catch (error) {
    console.error('Sitemap could not be generated:', error instanceof Error ? error.message : error)
    response.status(500).send('Sitemap could not be generated.')
  }
}

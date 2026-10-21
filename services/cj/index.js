const cjApiBaseUrl = (process.env.CJ_API_BASE_URL || '').replace(/\/+$/, '')
const cjAccessToken = process.env.CJ_ACCESS_TOKEN || ''
const cjApiKey = process.env.CJ_API_KEY || ''
const cjApiSecret = process.env.CJ_API_SECRET || ''

export function getCJConfig() {
  const configured = Boolean(cjApiBaseUrl && (cjAccessToken || (cjApiKey && cjApiSecret)))

  return {
    configured,
    baseUrl: cjApiBaseUrl,
    hasAccessToken: Boolean(cjAccessToken),
    hasApiKey: Boolean(cjApiKey),
    hasApiSecret: Boolean(cjApiSecret),
    note: 'CJdropshipping request names, payload shapes, and endpoint paths must be confirmed against the official CJ API documentation before production use.',
  }
}

function requireCJEnvironment() {
  const config = getCJConfig()
  if (!config.configured || !config.baseUrl) {
    throw new Error('CJ endpoint is not configured on the server. Add CJ_API_BASE_URL and the required CJ auth values to your .env file.')
  }
  return config
}

export function getCJHeaders(extraHeaders = {}) {
  const { hasAccessToken, hasApiKey, hasApiSecret } = requireCJEnvironment()
  const headers = { Accept: 'application/json', ...extraHeaders }

  if (hasAccessToken) headers['CJ-Access-Token'] = cjAccessToken
  if (hasApiKey) headers['X-CJ-API-Key'] = cjApiKey
  if (hasApiSecret) headers['X-CJ-API-Secret'] = cjApiSecret

  return headers
}

export const CJ_ENDPOINTS = Object.freeze({
  auth: '/api2.0/v1/auth/token',
  productSearch: '/api2.0/v1/product/listV2',
  productDetails: '/api2.0/v1/product/query',
  variants: '/api2.0/v1/product/variant/query',
  inventory: '/api2.0/v1/product/stock/getInventoryByPid',
  pricing: '/api2.0/v1/product/query',
  shipping: '/api2.0/v1/product/query',
  orderCreate: '/api2.0/v1/order/create',
  orderStatus: '/api2.0/v1/order/query',
  tracking: '/api2.0/v1/order/tracking',
  cancellation: '/api2.0/v1/order/cancel',
})

function resolveCJPath(endpointKey, overridePath) {
  const candidate = typeof overridePath === 'string' && overridePath.trim() ? overridePath.trim() : CJ_ENDPOINTS[endpointKey]
  if (!candidate || String(candidate).includes('TODO')) {
    throw new Error(`CJ ${endpointKey} endpoint is not configured. Confirm the official CJ documentation and provide the exact endpoint path before using this helper.`)
  }
  return candidate
}

export async function cjRequest({ path, method = 'GET', body, headers = {}, timeoutMs = 20_000, query = {} } = {}) {
  const { baseUrl } = requireCJEnvironment()

  if (!path) {
    throw new Error('A CJ API path is required. Confirm the official CJ endpoint from the current supplier documentation before calling this helper.')
  }

  const endpoint = /^https?:\/\//i.test(path) ? path : path.startsWith('/') ? path : `/${path}`
  const url = new URL(endpoint, baseUrl)

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url, {
    method,
    headers: getCJHeaders(headers),
    body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  const responseText = await response.text()
  let payload = null

  if (responseText) {
    try {
      payload = JSON.parse(responseText)
    } catch {
      payload = responseText
    }
  }

  if (!response.ok) {
    const message = payload && typeof payload === 'object'
      ? (payload.message || payload.error || payload.detail || JSON.stringify(payload))
      : responseText || `CJ API request failed with status ${response.status}.`
    throw new Error(message)
  }

  if (payload && typeof payload === 'object' && (payload.result === false || payload.success === false)) {
    const message = payload.message || payload.error || 'CJ returned an unsuccessful response.'
    throw new Error(payload.code !== undefined ? `CJ API error ${payload.code}: ${message}` : `CJ API error: ${message}`)
  }

  return payload
}

export async function searchProducts({ query = '', filters = {}, path } = {}) {
  const endpoint = resolveCJPath('productSearch', path)
  const searchTerm = typeof query === 'string' ? query.trim() : ''
  const params = { ...(searchTerm ? { keyWord: searchTerm } : {}), ...filters }

  return cjRequest({
    path: endpoint,
    method: 'GET',
    query: params,
  })
}

export function normalizeCJProductLookup(detail = {}) {
  const product = detail && typeof detail === 'object' ? detail : {}
  const candidateVariants = Array.isArray(product.variants) ? product.variants : []
  const candidateInventory = Array.isArray(product.variantInventory) ? product.variantInventory : []
  const inventoryTotal = candidateInventory.reduce((total, variantEntry) => {
    const entries = Array.isArray(variantEntry?.inventory) ? variantEntry.inventory : []
    const variantTotal = entries.reduce((sum, inventoryEntry) => {
      const value = Number(inventoryEntry?.totalInventory ?? inventoryEntry?.total ?? inventoryEntry?.quantity ?? 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    return total + variantTotal
  }, 0)

  const variants = candidateVariants.map((variant) => ({
    id: String(variant?.vid ?? variant?.id ?? ''),
    sku: String(variant?.variantSku ?? variant?.sku ?? ''),
    name: variant?.variantNameEn ?? variant?.nameEn ?? variant?.name ?? '',
    price: Number(variant?.variantSellPrice ?? variant?.sellPrice ?? variant?.price ?? 0),
    stock: Number(variant?.totalInventory ?? variant?.inventory ?? 0),
  }))
  const rawPrice = product.sellPrice ?? product.nowPrice ?? product.discountPrice ?? product.price
  const price = typeof rawPrice === 'number'
    ? rawPrice
    : Number.parseFloat(String(rawPrice ?? '').match(/-?\d+(?:\.\d+)?/)?.[0] || '')

  return {
    id: String(product.pid ?? product.id ?? ''),
    sku: String(product.productSku ?? product.sku ?? ''),
    name: product.productNameEn ?? product.nameEn ?? product.name ?? 'Untitled CJ product',
    category: product.categoryName ?? product.category ?? product.threeCategoryName ?? product.twoCategoryName ?? product.oneCategoryName ?? 'Uncategorized',
    price: Number.isFinite(price) ? price : 0,
    image: product.bigImage ?? product.productImage ?? product.image ?? '',
    description: product.description ?? '',
    stock: Number.isFinite(inventoryTotal) ? inventoryTotal : Number(product.stock ?? 0),
    variants,
    raw: product,
  }
}

export function normalizeCJProductSearchResults(response = {}) {
  const data = response && typeof response === 'object' && 'data' in response ? response.data : response
  const pagedProducts = Array.isArray(data?.content)
    ? data.content.flatMap((page) => Array.isArray(page?.productList) ? page.productList : [])
    : []
  const products = Array.isArray(data)
    ? data
    : pagedProducts.length
      ? pagedProducts
      : [data?.list, data?.products, data?.records, data?.productList, data?.content].find(Array.isArray) || []

  return products
    .map((product) => normalizeCJProductLookup(product))
    .filter((product) => product.id)
}

export async function getProductDetails({ productId, productSku, variantSku, path } = {}) {
  const hasProductId = productId !== undefined && productId !== null && String(productId).trim() !== ''
  const hasProductSku = productSku !== undefined && productSku !== null && String(productSku).trim() !== ''
  const hasVariantSku = variantSku !== undefined && variantSku !== null && String(variantSku).trim() !== ''

  if (!hasProductId && !hasProductSku && !hasVariantSku) {
    throw new Error('A CJ product ID, product SKU, or variant SKU is required to fetch product details.')
  }

  const endpoint = resolveCJPath('productDetails', path)
  const query = {}
  if (hasProductId) query.pid = String(productId)
  if (hasProductSku) query.productSku = String(productSku)
  if (hasVariantSku) query.variantSku = String(variantSku)

  return cjRequest({
    path: endpoint,
    method: 'GET',
    query,
  })
}

export async function lookupCJProductBySku({ sku, path } = {}) {
  const productSku = typeof sku === 'string' ? sku.trim() : ''
  if (!productSku) throw new Error('A CJ product SKU is required for admin lookup.')

  let response
  try {
    response = await getProductDetails({ productSku, path: path || '/api2.0/v1/product/query' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/1602001|product not found/i.test(message)) throw error
    await new Promise((resolve) => setTimeout(resolve, 1100))
    response = await getProductDetails({ variantSku: productSku, path: path || '/api2.0/v1/product/query' })
  }

  const detail = response && typeof response === 'object' && 'data' in response ? response.data : response

  if (!detail || (typeof detail === 'object' && !Object.keys(detail).length)) {
    throw new Error(`CJ product with SKU ${productSku} was not found.`)
  }

  const normalized = normalizeCJProductLookup(detail)
  if (!normalized.sku && productSku) normalized.sku = productSku
  return normalized
}

export async function getProductVariants({ productId, path } = {}) {
  if (!productId) throw new Error('A CJ product ID is required to fetch variants.')
  const endpoint = resolveCJPath('variants', path)
  return cjRequest({
    path: endpoint.replace('{productId}', encodeURIComponent(String(productId))),
    method: 'GET',
    query: { pid: String(productId) },
  })
}

export async function getProductInventory({ productId, path } = {}) {
  if (!productId) throw new Error('A CJ product ID is required to fetch inventory.')
  const endpoint = resolveCJPath('inventory', path)
  return cjRequest({
    path: endpoint.replace('{productId}', encodeURIComponent(String(productId))),
    method: 'GET',
    query: { pid: String(productId) },
  })
}

export function normalizeCJInventoryResponse(response = {}) {
  const data = response && typeof response === 'object' && 'data' in response ? response.data : response
  const variantEntries = Array.isArray(data?.variantInventories)
    ? data.variantInventories.map((variant) => {
      const stockGroups = Array.isArray(variant?.inventory) ? variant.inventory : []
      const stockEntries = stockGroups.flatMap((group) => Array.isArray(group?.stock) ? group.stock : [])
      const stock = stockEntries.reduce((total, entry) => {
        const warehouseStock = Number(entry?.inventory ?? 0)
        const factoryStock = Number(entry?.factoryInventory ?? 0)
        return total + (Number.isFinite(warehouseStock) ? warehouseStock : 0) + (Number.isFinite(factoryStock) ? factoryStock : 0)
      }, 0)

      return { cjVariantId: String(variant?.vid ?? variant?.variantId ?? ''), stock, raw: variant ?? null }
    })
    : []
  const entries = Array.isArray(data)
    ? data
    : variantEntries.length
      ? variantEntries
      : [data?.inventoryList, data?.variantInventoryList, data?.list, data?.content, data?.inventory].find(Array.isArray) || []

  return entries.map((entry) => {
    const rawStock = entry?.availableInventory ?? entry?.availableNum ?? entry?.totalInventory ?? entry?.totalInventoryNum ?? entry?.inventoryNum ?? entry?.storageNum ?? entry?.stock ?? entry?.quantity ?? entry?.inventory ?? 0
    const stock = Number(rawStock)
    return {
      cjVariantId: String(entry?.vid ?? entry?.variantId ?? entry?.cjVariantId ?? entry?.id ?? ''),
      stock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
      raw: entry ?? null,
    }
  }).filter((entry) => entry.cjVariantId)
}

export async function getProductPricing({ productId, path } = {}) {
  if (!productId) throw new Error('A CJ product ID is required to fetch pricing.')
  const endpoint = resolveCJPath('pricing', path)
  return cjRequest({
    path: endpoint.replace('{productId}', encodeURIComponent(String(productId))),
    method: 'GET',
  })
}

export async function getShippingQuote({ productId, quantity = 1, path } = {}) {
  if (!productId) throw new Error('A CJ product ID is required to quote shipping.')
  const endpoint = resolveCJPath('shipping', path)
  return cjRequest({
    path: endpoint.replace('{productId}', encodeURIComponent(String(productId))),
    method: 'POST',
    body: { productId, quantity },
  })
}

export async function createCJOrder({ payload, path } = {}) {
  if (!payload) throw new Error('A CJ order payload is required.')
  const endpoint = resolveCJPath('orderCreate', path)
  return cjRequest({
    path: endpoint,
    method: 'POST',
    body: payload,
  })
}

export async function getCJOrderStatus({ orderId, path } = {}) {
  if (!orderId) throw new Error('A CJ order ID is required.')
  const endpoint = resolveCJPath('orderStatus', path)
  return cjRequest({
    path: endpoint.replace('{orderId}', encodeURIComponent(String(orderId))),
    method: 'GET',
  })
}

export async function getCJTracking({ orderId, path } = {}) {
  if (!orderId) throw new Error('A CJ order ID is required to fetch tracking information.')
  const endpoint = resolveCJPath('tracking', path)
  return cjRequest({
    path: endpoint.replace('{orderId}', encodeURIComponent(String(orderId))),
    method: 'GET',
  })
}

export async function cancelCJOrder({ orderId, path } = {}) {
  if (!orderId) throw new Error('A CJ order ID is required to cancel an order.')
  const endpoint = resolveCJPath('cancellation', path)
  return cjRequest({
    path: endpoint.replace('{orderId}', encodeURIComponent(String(orderId))),
    method: 'POST',
  })
}

export function classifyMorrowHouseCategory(product = {}) {
  const text = [
    product.productNameEn,
    product.productName,
    product.name,
    product.categoryName,
    product.category,
    product.description,
  ].filter(Boolean).join(' ').toLowerCase()

  if (/\b(lamp|lighting|light fixture|chandelier|sconce|pendant light|bulb|lantern)\b/.test(text)) {
    return 'Lighting'
  }

  if (/\b(furniture|sofa|couch|chair|armchair|stool|bench|bed|bedding|mattress|curtain|drape|rug|carpet|table|desk|shelf|shelving|cabinet|wardrobe)\b/.test(text)) {
    return 'Living'
  }

  return 'Objects'
}

export function summarizeProductName(value) {
  const original = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  const normalized = original.replace(/\bmoisturizing\s+and\s+humidifying\b/i, 'Humidifier')
  if (normalized.length <= 72) return normalized

  const clauses = normalized.split(/[,;|]/).map((clause) => clause.trim()).filter(Boolean)
  const productType = /\b(sofa|couch|chair|armchair|stool|bench|bed|mattress|curtain|rug|carpet|table|desk|shelf|cabinet|wardrobe|lamp|light|humidifier|vase|mirror|basket|clock|cushion|pillow)\b/i
  const candidates = clauses.filter((clause) => {
    const wordCount = clause.split(/\s+/).length
    return wordCount >= 2 && wordCount <= 6 && productType.test(clause)
  })
  const firstClause = candidates.sort((left, right) => left.length - right.length)[0] || clauses[0] || normalized
  const words = firstClause.split(/\s+/)
  const seen = new Set()
  const concise = words.filter((word) => {
    const normalized = word.toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  }).join(' ')
  const title = concise || firstClause || normalized
  if (title.length <= 64) return title
  const truncated = title.slice(0, 61)
  return `${truncated.slice(0, truncated.lastIndexOf(' '))}...`
}

export function summarizeProductText(value, maxLength = 180) {
  if (typeof value !== 'string' || !value.trim()) return ''

  const lines = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !/^(?:product information|size information|packing list|product picture|product pictures|specification|specifications|product details|details|description)\s*:?$/i.test(line))
    .filter((line) => !/^(?:product model|model|product name)\s*:/i.test(line))
    .flatMap((line) => line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((part) => part.trim())
    .filter(Boolean)

  const text = lines.join(' ')

  if (text.length <= maxLength) return text

  const selectedLines = lines.slice(0, 2)
  const summary = selectedLines.map((line, index) => {
    const sentence = line.trim()
    return index < selectedLines.length - 1 && !/[.!?]$/.test(sentence) ? `${sentence}.` : sentence
  }).join(' ')
  if (summary.length <= maxLength) return summary

  const truncated = summary.slice(0, maxLength - 3)
  return `${truncated.slice(0, truncated.lastIndexOf(' '))}...`
}

export function buildCJProductImportPayload(detail = {}, variants = [], inventory = []) {
  const product = detail && typeof detail === 'object' ? detail : {}
  const normalizedVariants = Array.isArray(variants) && variants.length
    ? variants
    : (Array.isArray(product.variants) ? product.variants : [])
  const normalizedInventory = Array.isArray(inventory) && inventory.length
    ? inventory
    : (Array.isArray(product.inventory) ? product.inventory : [])

  const productImages = product.images ?? product.productImageSet
  const images = Array.isArray(productImages)
    ? productImages.map((image) => {
      if (typeof image === 'string') return image
      if (image && typeof image === 'object') {
        return image.imageUrl || image.url || image.src || ''
      }
      return ''
    }).filter(Boolean)
    : [product.bigImage ?? product.productImage ?? product.image ?? product.imageUrl ?? product.url].filter(Boolean)

  const rawProductPrice = product.price ?? product.sellPrice ?? product.salePrice ?? product.retailPrice
  const productPrice = typeof rawProductPrice === 'number'
    ? rawProductPrice
    : Number.parseFloat(String(rawProductPrice ?? '').match(/-?\d+(?:\.\d+)?/)?.[0] || '')

  const mappedVariants = normalizedVariants.map((entry, index) => {
    const variantId = entry?.vid ?? entry?.id ?? entry?.variantId ?? entry?.variant_id ?? entry?.sku ?? entry?.variantSku ?? `variant-${index + 1}`
    const sku = entry?.variantSku ?? entry?.sku ?? entry?.SKU ?? entry?.variant_sku ?? ''
    const stock = Number(entry?.inventoryNum ?? entry?.stock ?? entry?.inventory ?? 0)
    const rawVariantPrice = entry?.variantSellPrice ?? entry?.price ?? entry?.salePrice ?? entry?.retailPrice ?? productPrice
    const price = Number(rawVariantPrice)

    return {
      cjVariantId: String(variantId),
      sku: String(sku),
      name: entry?.variantNameEn ?? entry?.name ?? entry?.title ?? product.productNameEn ?? product.name ?? '',
      stock: Number.isFinite(stock) ? stock : 0,
      price: Number.isFinite(price) ? price : 0,
      raw: entry ?? null,
    }
  })

  const mappedInventory = normalizedInventory.length
    ? normalizedInventory.map((entry, index) => {
      const variantId = entry?.variantId ?? entry?.variant_id ?? entry?.cjVariantId ?? mappedVariants[index]?.cjVariantId ?? ''
      const stock = Number(entry?.stock ?? entry?.quantity ?? entry?.available ?? 0)

      return {
        cjVariantId: String(variantId),
        stock: Number.isFinite(stock) ? stock : 0,
        raw: entry ?? null,
      }
    })
    : normalizedVariants.map((entry, index) => ({
      cjVariantId: mappedVariants[index]?.cjVariantId ?? '',
      stock: Number.isFinite(Number(entry?.inventoryNum)) ? Number(entry.inventoryNum) : 0,
      raw: entry?.inventories ?? null,
    }))

  return {
    cjProductId: String(product.pid ?? product.id ?? product.productId ?? product.product_id ?? ''),
    name: product.productNameEn ?? product.name ?? product.title ?? '',
    category: classifyMorrowHouseCategory(product),
    description: product.description ?? product.detail ?? '',
    sku: product.sku ?? product.productSku ?? '',
    price: Number.isFinite(productPrice) ? productPrice : 0,
    images,
    variants: mappedVariants,
    inventory: mappedInventory,
    isActive: false,
    source: 'cj',
    raw: product,
  }
}

export function buildApprovedMorrowHouseProduct(supplierProduct = {}) {
  const product = supplierProduct && typeof supplierProduct === 'object' ? supplierProduct : {}
  const imageCandidates = Array.isArray(product.images) ? product.images : []
  const firstImage = typeof product.image === 'string' && product.image
    ? product.image
    : imageCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || ''
  const stockEntries = Array.isArray(product.inventory) ? product.inventory : []
  const stockTotal = stockEntries.reduce((total, entry) => {
    const value = Number(entry?.stock ?? entry?.quantity ?? entry?.available ?? 0)
    return total + (Number.isFinite(value) ? value : 0)
  }, 0)

  return {
    id: String(product.cj_product_id ?? product.cjProductId ?? product.id ?? ''),
    name: product.name ?? 'Untitled product',
    category: product.category ?? 'Uncategorized',
    sku: product.sku ?? '',
    price_cents: Math.max(0, Math.round(Number(product.price ?? 0) * 100)),
    stock: Math.max(0, stockTotal),
    image: firstImage,
    is_active: Boolean(product.is_active ?? product.isActive ?? false),
  }
}

export function buildApprovedMorrowHouseCatalog(supplierProducts = []) {
  const products = Array.isArray(supplierProducts) ? supplierProducts : []
  return products
    .filter((product) => product && typeof product === 'object')
    .map((product) => buildApprovedMorrowHouseProduct(product))
}

export function buildCJSyncSummary({ imported = [], approved = [] } = {}) {
  const importedCount = Array.isArray(imported) ? imported.length : 0
  const approvedCount = Array.isArray(approved) ? approved.length : 0
  const pendingCount = Math.max(0, importedCount - approvedCount)

  return {
    importedCount,
    approvedCount,
    pendingCount,
    needsAttention: pendingCount > 0,
  }
}

export function buildCJInventorySyncUpdate(supplierProduct = {}) {
  const product = supplierProduct && typeof supplierProduct === 'object' ? supplierProduct : {}
  const inventory = Array.isArray(product.inventory) ? product.inventory : []
  const stockTotal = inventory.reduce((total, entry) => {
    const value = Number(entry?.stock ?? entry?.quantity ?? entry?.available ?? 0)
    return total + (Number.isFinite(value) ? value : 0)
  }, 0)

  return {
    id: String(product.cj_product_id ?? product.cjProductId ?? product.id ?? ''),
    stock: Math.max(0, stockTotal),
    reorder_at: 5,
    is_active: Boolean(product.is_active ?? product.isActive ?? false),
  }
}

export function buildCJBulkSyncPlan(supplierProducts = []) {
  const products = Array.isArray(supplierProducts) ? supplierProducts : []
  return products
    .filter((product) => product && typeof product === 'object')
    .map((product) => buildCJInventorySyncUpdate(product))
}

export function buildCJOrderPayload(order = {}) {
  const incoming = order && typeof order === 'object' ? order : {}
  const address = incoming.shippingAddress && typeof incoming.shippingAddress === 'object' ? incoming.shippingAddress : {}

  return {
    productId: String(incoming.productId ?? incoming.product_id ?? ''),
    quantity: Number.isInteger(incoming.quantity) ? incoming.quantity : 1,
    customerName: incoming.customerName ?? incoming.customer_name ?? '',
    shippingAddress: {
      name: address.name ?? incoming.customerName ?? incoming.customer_name ?? '',
      line1: address.line1 ?? address.address1 ?? '',
      line2: address.line2 ?? address.address2 ?? '',
      city: address.city ?? '',
      state: address.state ?? address.region ?? '',
      postalCode: address.postalCode ?? address.postal_code ?? address.zip ?? '',
      country: address.country ?? 'US',
    },
    notes: 'Order created by Morrow House backend.',
    raw: incoming,
  }
}

export function getCJHealthStatus() {
  const config = getCJConfig()

  if (!config.configured) {
    return {
      configured: false,
      note: 'Add CJ_API_BASE_URL and the required CJ credentials to the server environment before invoking supplier APIs.',
    }
  }

  return {
    configured: true,
    baseUrl: config.baseUrl,
    authMethods: {
      accessToken: config.hasAccessToken,
      apiKey: config.hasApiKey,
      apiSecret: config.hasApiSecret,
    },
    note: 'Use the official CJ API documentation to confirm the exact paths, request bodies, and response payloads before final production implementation.',
  }
}

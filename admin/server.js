import 'dotenv/config'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { buildCJProductImportPayload, getCJConfig, getProductDetails, getProductInventory, normalizeCJInventoryResponse, normalizeCJProductSearchResults, searchProducts } from '../services/cj/index.js'

const host = '127.0.0.1'
const port = Number(process.env.ADMIN_API_PORT || 4243)
const webOrigin = process.env.ADMIN_WEB_ORIGIN || 'http://127.0.0.1:4174'
const password = process.env.ADMIN_PASSWORD || ''
const sessionSecret = process.env.ADMIN_SESSION_SECRET || randomBytes(32).toString('hex')
const sessionDuration = 8 * 60 * 60 * 1000
const cookieName = 'morrow_admin_session'
const loginAttempts = new Map()
const products = []
const orders = []
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null
const app = express()

if (password.length < 16) {
  console.error('Admin server not started: set ADMIN_PASSWORD to a unique passphrase of at least 16 characters in .env.')
  process.exit(1)
}

app.disable('x-powered-by')
app.use(express.json({ limit: '8kb' }))
app.use((request, response, next) => {
  response.set('Cache-Control', 'no-store')
  if (request.headers.origin && request.headers.origin !== webOrigin) {
    return response.status(403).json({ error: 'Requests must come from the private admin app.' })
  }
  next()
})

function signSession(expiry) {
  return createHmac('sha256', sessionSecret).update(expiry).digest('base64url')
}

function getSession(request) {
  const cookie = request.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`))
  if (!cookie) return false
  const [expiry, signature] = decodeURIComponent(cookie.slice(cookieName.length + 1)).split('.')
  if (!expiry || !signature || Number(expiry) <= Date.now()) return false
  const expected = Buffer.from(signSession(expiry))
  const received = Buffer.from(signature)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function isPasswordValid(candidate) {
  const expected = Buffer.from(password)
  const received = Buffer.from(candidate)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function consumeLoginAttempt(ip) {
  const now = Date.now()
  const attempt = loginAttempts.get(ip)
  if (!attempt || now - attempt.startedAt >= 15 * 60 * 1000) {
    loginAttempts.set(ip, { startedAt: now, count: 1 })
    return true
  }
  if (attempt.count >= 8) return false
  attempt.count += 1
  return true
}

function requireAdmin(request, response, next) {
  if (!getSession(request)) return response.status(401).json({ error: 'Sign in to access the admin dashboard.' })
  next()
}

function formatPlacedDate(rawDate) {
  if (!rawDate) return ''
  const parsed = new Date(rawDate)
  if (Number.isNaN(parsed.getTime())) return rawDate
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeProduct(product) {
  const stock = Number(product.stock ?? 0)
  const price = Number(product.price ?? (product.price_cents != null ? Number(product.price_cents) / 100 : 0))
  return {
    id: String(product.id ?? ''),
    name: product.name ?? product.title ?? '',
    sku: product.sku ?? '',
    category: product.category ?? '',
    price: Number.isFinite(price) ? price : 0,
    stock: Number.isFinite(stock) ? stock : 0,
    reorderAt: Number(product.reorder_at ?? product.reorderAt ?? 0) || 0,
    image: product.image ?? product.image_url ?? '',
  }
}

function normalizeCJProduct(product) {
  const inventory = Array.isArray(product.inventory) ? product.inventory : []
  const stockTotal = inventory.reduce((total, entry) => {
    const value = Number(entry?.stock ?? entry?.quantity ?? entry?.available ?? 0)
    return total + (Number.isFinite(value) ? value : 0)
  }, 0)

  const imageCandidates = Array.isArray(product.images) ? product.images : []
  const firstImage = imageCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || product.image || ''

  return {
    id: String(product.cj_product_id ?? product.id ?? ''),
    name: product.name ?? 'Untitled product',
    category: product.category ?? 'Uncategorized',
    sku: product.sku ?? '',
    price: Number(product.price ?? 0),
    stock: Math.max(0, stockTotal),
    image: firstImage,
    isActive: Boolean(product.is_active ?? false),
    updatedAt: product.updated_at ?? product.updatedAt ?? null,
  }
}

function normalizeOrder(order, itemRows = []) {
  const orderItems = Array.isArray(itemRows) ? itemRows : []
  const items = orderItems.reduce((total, item) => total + Number(item.quantity ?? 0), 0)
  const itemsTotal = orderItems.reduce((sum, item) => sum + Number(item.unit_price_cents ?? item.unit_price ?? item.price ?? 0) * Number(item.quantity ?? 0), 0)
  const total = Number(order.total ?? order.total_amount ?? (order.total_cents != null ? Number(order.total_cents) / 100 : itemsTotal / 100))
  return {
    id: String(order.id ?? ''),
    customer: order.customer_name ?? order.customer ?? order.billing_name ?? '',
    email: order.email ?? order.customer_email ?? '',
    placed: formatPlacedDate(order.created_at ?? order.createdAt ?? order.placed_at),
    items: Number.isFinite(items) ? items : 0,
    total: Number.isFinite(total) ? total : 0,
    status: ['Paid', 'Processing', 'Fulfilled', 'Cancelled'].includes(order.status) ? order.status : '',
  }
}

function buildEmptyRevenueSeries() {
  const today = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    return {
      day: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3),
      amount: 0,
    }
  })
}

function buildRevenueSeries(rows) {
  if (!Array.isArray(rows) || !rows.length) return buildEmptyRevenueSeries()

  const totals = rows.map((entry) => ({
    day: new Date(entry.created_at ?? entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    amount: Number(entry.total ?? entry.total_amount ?? (entry.total_cents != null ? Number(entry.total_cents) / 100 : 0)),
  }))

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - index))
    const amount = totals.filter((row) => row.day === date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).reduce((sum, row) => sum + row.amount, 0)
    return { day: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3), amount }
  })

  return lastSevenDays.map((entry) => ({ ...entry, amount: Number(entry.amount) || 0 }))
}

async function getLiveDashboardData() {
  if (!supabase) {
    return {
      mode: 'empty',
      products: [],
      orders: [],
      revenue: buildEmptyRevenueSeries(),
      updatedAt: new Date().toISOString(),
    }
  }

  try {
    const [productResult, orderResult, itemResult] = await Promise.all([
      supabase.from('products').select('*').order('name', { ascending: true }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_items').select('*'),
    ])

    if (productResult.error) throw productResult.error
    if (orderResult.error) throw orderResult.error
    if (itemResult.error) throw itemResult.error

    const productRows = Array.isArray(productResult.data) ? productResult.data : []
    const orderRows = Array.isArray(orderResult.data) ? orderResult.data : []
    const itemRows = Array.isArray(itemResult.data) ? itemResult.data : []

    const productsList = productRows.map(normalizeProduct)
    const orderList = orderRows.map((order) => normalizeOrder(order, itemRows.filter((item) => item.order_id === order.id)))

    return {
      mode: 'live',
      products: productsList,
      orders: orderList,
      revenue: buildRevenueSeries(orderRows),
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Supabase admin query failed:', error.message || error)
    return {
      mode: 'empty',
      products: [],
      orders: [],
      revenue: buildEmptyRevenueSeries(),
      updatedAt: new Date().toISOString(),
    }
  }
}

async function updateProductStock(productId, stock) {
  if (!supabase) {
    const product = products.find((item) => item.id === productId)
    if (!product) return null
    product.stock = stock
    return product
  }

  const { data, error } = await supabase.from('products').update({ stock }).eq('id', productId).select().single()
  if (error) throw error
  return normalizeProduct(data)
}

async function getLiveCJData() {
  if (!supabase) {
    return {
      mode: 'empty',
      products: [],
      updatedAt: new Date().toISOString(),
    }
  }

  try {
    const { data, error } = await supabase
      .from('cj_products')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) throw error
    return {
      mode: 'live',
      products: (data || []).map(normalizeCJProduct),
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Supabase CJ query failed:', error.message || error)
    return {
      mode: 'empty',
      products: [],
      updatedAt: new Date().toISOString(),
    }
  }
}

async function getLiveCJSyncStatus() {
  if (!supabase) {
    return {
      imported: 0,
      approved: 0,
      pending: 0,
      lastUpdated: null,
      logs: [],
    }
  }

  try {
    const [{ data: importedRows, error: importedError }, { data: approvedRows, error: approvedError }, { data: logRows, error: logError }] = await Promise.all([
      supabase.from('cj_products').select('cj_product_id, updated_at'),
      supabase.from('products').select('id, updated_at'),
      supabase.from('sync_logs').select('*').order('created_at', { ascending: false }).limit(8),
    ])

    if (importedError) throw importedError
    if (approvedError) throw approvedError
    if (logError) throw logError

    const imported = Array.isArray(importedRows) ? importedRows : []
    const approved = Array.isArray(approvedRows) ? approvedRows : []
    const importedIds = new Set(imported.map((product) => String(product.cj_product_id || product.id || '')))
    const approvedCount = approved.filter((product) => importedIds.has(String(product.id || ''))).length
    const lastImport = imported.reduce((latest, product) => {
      const value = product.updated_at || product.created_at || product.last_updated
      if (!value) return latest
      if (!latest) return value
      return new Date(value) > new Date(latest) ? value : latest
    }, null)
    const latestLog = Array.isArray(logRows) && logRows.length ? logRows[0].created_at || null : null

    return {
      imported: imported.length,
      approved: approvedCount,
      pending: Math.max(imported.length - approvedCount, 0),
      lastUpdated: latestLog || lastImport || null,
      logs: (logRows || []).map((entry) => ({
        id: entry.id || `${entry.entity_type}-${entry.created_at || Date.now()}`,
        status: entry.status || 'info',
        message: entry.message || 'Supplier event logged.',
        entityType: entry.entity_type || 'supplier',
        createdAt: entry.created_at || null,
      })),
    }
  } catch (error) {
    console.error('CJ sync status query failed:', error.message || error)
    return {
      imported: 0,
      approved: 0,
      pending: 0,
      lastUpdated: null,
      logs: [],
    }
  }
}

async function importCJProductToSupabase(productId) {
  if (!supabase) throw new Error('Supplier sync is not configured. Add Supabase to the admin environment before importing CJ products.')
  if (!getCJConfig().configured) {
    throw new Error('CJdropshipping is not configured on the server. Add CJ_API_BASE_URL and the required CJ credentials to the environment.')
  }

  const response = await getProductDetails({ productId })
  const productDetail = response?.data
  if (!productDetail || typeof productDetail !== 'object' || !productDetail.pid) {
    throw new Error('CJ did not return product details for the requested product ID.')
  }
  const inventoryResponse = await getProductInventory({ productId })
  const inventory = normalizeCJInventoryResponse(inventoryResponse)
  const payload = buildCJProductImportPayload(productDetail, [], inventory)

  const { data, error } = await supabase
    .from('cj_products')
    .upsert({
      cj_product_id: payload.cjProductId,
      name: payload.name,
      description: payload.description,
      category: payload.category,
      sku: payload.sku,
      price: payload.price,
      images: payload.images,
      variants: payload.variants,
      inventory: payload.inventory,
      is_active: payload.isActive,
      source: payload.source,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cj_product_id' })
    .select()
    .single()

  if (error) throw error

  const { error: catalogDraftError } = await supabase
    .from('products')
    .upsert({
      id: payload.cjProductId,
      sku: payload.sku,
      name: payload.name,
      category: payload.category,
      price_cents: 0,
      stock: 0,
      image: payload.images[0] || null,
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: true })

  if (catalogDraftError) throw catalogDraftError

  await supabase.from('sync_logs').insert({
    entity_type: 'cj_product',
    entity_id: payload.cjProductId,
    status: 'success',
    message: 'CJ product import synchronized to Supabase from the private admin dashboard.',
    payload: {
      productId: payload.cjProductId,
      importedAt: new Date().toISOString(),
      supplierCategory: productDetail.categoryName || null,
      morrowHouseCategory: payload.category,
    },
  })

  return data || payload
}

async function approveCJProduct(productId, retailPrice, stock) {
  if (!supabase) throw new Error('Supplier sync is not configured. Add Supabase to the admin environment before approving CJ products.')
  if (!Number.isFinite(retailPrice) || retailPrice <= 0 || retailPrice > 999999) {
    throw new Error('Enter a Morrow House retail price greater than $0 and no more than $999,999 before publishing.')
  }
  if (!Number.isInteger(stock) || stock < 1 || stock > 9999) {
    throw new Error('Enter a verified stock quantity between 1 and 9999 before publishing.')
  }

  const { data: supplierProduct, error: fetchError } = await supabase
    .from('cj_products')
    .select('*')
    .eq('cj_product_id', productId)
    .single()

  if (fetchError) throw fetchError
  if (!supplierProduct) throw new Error('CJ product not found.')

  const imageCandidates = Array.isArray(supplierProduct.images) ? supplierProduct.images : []
  const firstImage = imageCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || supplierProduct.image || ''

  const approvedProduct = {
    id: String(supplierProduct.cj_product_id),
    sku: supplierProduct.sku ?? '',
    name: supplierProduct.name ?? 'Untitled product',
    category: supplierProduct.category ?? 'Uncategorized',
    price_cents: Math.round(retailPrice * 100),
    stock,
    image: firstImage,
    is_active: true,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('products')
    .upsert(approvedProduct, { onConflict: 'id' })
    .select()
    .single()

  if (error) throw error

  const { error: supplierUpdateError } = await supabase
    .from('cj_products')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('cj_product_id', productId)

  if (supplierUpdateError) throw supplierUpdateError

  await supabase.from('sync_logs').insert({
    entity_type: 'morrow_house_admin_approval',
    entity_id: approvedProduct.id,
    status: 'success',
    message: 'CJ product approved from the private admin dashboard.',
    payload: {
      approvedAt: new Date().toISOString(),
      sourceProductId: approvedProduct.id,
    },
  })

  return normalizeProduct(data || approvedProduct)
}

async function updateOrderStatus(orderId, status) {
  if (!supabase) {
    const order = orders.find((item) => item.id === orderId)
    if (!order) return null
    order.status = status
    return order
  }

  const { data, error } = await supabase.from('orders').update({ status }).eq('id', orderId).select().single()
  if (error) throw error
  return normalizeOrder(data)
}

app.get('/api/admin/session', (request, response) => {
  response.json({ authenticated: getSession(request) })
})

app.post('/api/admin/login', (request, response) => {
  const ip = request.socket.remoteAddress || 'local'
  if (!consumeLoginAttempt(ip)) return response.status(429).json({ error: 'Too many attempts. Wait 15 minutes before trying again.' })
  const candidate = typeof request.body?.password === 'string' ? request.body.password : ''
  if (!isPasswordValid(candidate)) return response.status(401).json({ error: 'That passphrase did not match.' })
  const expiry = String(Date.now() + sessionDuration)
  const value = encodeURIComponent(`${expiry}.${signSession(expiry)}`)
  response.setHeader('Set-Cookie', `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionDuration / 1000)}`)
  response.json({ authenticated: true })
})

app.post('/api/admin/logout', (_request, response) => {
  response.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
  response.json({ authenticated: false })
})

app.use('/api/admin', requireAdmin)

app.get('/api/admin/dashboard', async (_request, response) => {
  const [dashboard, supplierData, syncStatus] = await Promise.all([
    getLiveDashboardData(),
    getLiveCJData(),
    getLiveCJSyncStatus(),
  ])

  response.json({
    ...dashboard,
    supplier: supplierData.products,
    supplierMode: supplierData.mode,
    supplierUpdatedAt: supplierData.updatedAt,
    syncSummary: syncStatus,
  })
})

app.get('/api/admin/cj/products', async (_request, response) => {
  const supplierData = await getLiveCJData()
  response.json({ products: supplierData.products, mode: supplierData.mode })
})

app.post('/api/admin/cj/products/search', async (request, response) => {
  const query = typeof request.body?.query === 'string' ? request.body.query.trim() : ''
  if (!query) {
    return response.status(400).json({ error: 'Enter a product name or keyword to search CJ.' })
  }

  try {
    const result = await searchProducts({ query, filters: { pageNum: 1, pageSize: 20 } })
    response.json({ ok: true, products: normalizeCJProductSearchResults(result) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The CJ product search failed.'
    response.status(500).json({ error: message })
  }
})

app.post('/api/admin/cj/products/:productId/sync-inventory', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supplier sync is not configured. Add Supabase to the admin environment.' })
  if (!getCJConfig().configured) return response.status(503).json({ error: 'CJdropshipping is not configured on the server.' })

  const productId = String(request.params.productId || '').trim()
  try {
    const { data: supplierProduct, error: lookupError } = await supabase
      .from('cj_products')
      .select('cj_product_id')
      .eq('cj_product_id', productId)
      .single()

    if (lookupError) throw lookupError
    if (!supplierProduct) return response.status(404).json({ error: 'Imported CJ product not found.' })

    const inventoryResponse = await getProductInventory({ productId })
    const inventory = normalizeCJInventoryResponse(inventoryResponse)
    if (!inventory.length) throw new Error('CJ returned no inventory records for this product.')

    const { data, error } = await supabase
      .from('cj_products')
      .update({ inventory, updated_at: new Date().toISOString() })
      .eq('cj_product_id', productId)
      .select()
      .single()

    if (error) throw error
    response.json({ ok: true, product: normalizeCJProduct(data) })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'CJ inventory could not be refreshed.' })
  }
})

app.post('/api/admin/cj/products/import', async (request, response) => {
  const productId = typeof request.body?.productId === 'string' ? request.body.productId.trim() : ''
  if (!productId) {
    return response.status(400).json({ error: 'A CJ product ID is required to import the product.' })
  }

  try {
    const product = await importCJProductToSupabase(productId)
    response.json({ ok: true, product })
  } catch (error) {
    response.status(500).json({ error: error.message || 'The CJ product could not be imported.' })
  }
})

app.get('/api/admin/cj/sync-status', async (_request, response) => {
  const syncStatus = await getLiveCJSyncStatus()
  response.json({ ok: true, ...syncStatus })
})

app.post('/api/admin/cj/products/:productId/approve', async (request, response) => {
  try {
    const product = await approveCJProduct(request.params.productId, Number(request.body?.retailPrice), Number(request.body?.stock))
    response.json({ ok: true, product })
  } catch (error) {
    response.status(500).json({ error: error.message || 'The CJ product could not be approved.' })
  }
})

app.post('/api/admin/cj/products/approve-all', async (_request, response) => {
  response.status(400).json({ error: 'Bulk approval is disabled. Set a Morrow House retail price and verified stock for each product before publishing.' })
})

app.patch('/api/admin/products/:productId', async (request, response) => {
  const stock = request.body?.stock
  if (!Number.isInteger(stock) || stock < 0 || stock > 9999) {
    return response.status(400).json({ error: 'Stock must be a whole number between 0 and 9999.' })
  }

  try {
    const product = await updateProductStock(request.params.productId, stock)
    if (!product) return response.status(404).json({ error: 'Product not found.' })
    response.json({ product })
  } catch (error) {
    response.status(500).json({ error: error.message || 'The product could not be updated.' })
  }
})

app.patch('/api/admin/orders/:orderId', async (request, response) => {
  const allowedStatuses = ['Paid', 'Processing', 'Fulfilled', 'Cancelled']
  if (!allowedStatuses.includes(request.body?.status)) {
    return response.status(400).json({ error: 'Choose a valid order status.' })
  }

  try {
    const order = await updateOrderStatus(request.params.orderId, request.body.status)
    if (!order) return response.status(404).json({ error: 'Order not found.' })
    response.json({ order })
  } catch (error) {
    response.status(500).json({ error: error.message || 'The order status could not be updated.' })
  }
})

app.listen(port, host, () => {
  console.log(`Private Morrow House admin API listening at http://${host}:${port}`)
  if (supabase) {
    console.log('Supabase connected. Inventory and orders are live from the database.')
  } else {
    console.log('Supabase is not configured yet. The dashboard is using preview data until SUPABASE_SERVICE_ROLE_KEY is added to .env.')
  }
})
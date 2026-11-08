import 'dotenv/config'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { buildCJProductImportPayload, getCJConfig, getProductDetails, getProductInventory, getProductVariants, normalizeCJInventoryResponse, normalizeCJProductSearchResults, searchProducts } from '../services/cj/index.js'
import { buildPublicProductRecord, createProductEditorContent, getProductReadiness, PRODUCT_EDITOR_STATUSES, validateProductEditorContent } from '../services/cj/product-editor.js'

const host = '127.0.0.1'
const port = Number(process.env.ADMIN_API_PORT || 4243)
const webOrigin = process.env.ADMIN_WEB_ORIGIN || 'http://127.0.0.1:4174'
const configuredWebUrl = new URL(webOrigin)
const password = process.env.ADMIN_PASSWORD || ''
const sessionSecret = process.env.ADMIN_SESSION_SECRET || randomBytes(32).toString('hex')
const sessionDuration = 8 * 60 * 60 * 1000
const cookieName = 'morrow_admin_session'
const adminActor = process.env.ADMIN_USER_LABEL || 'Local admin'
const loginAttempts = new Map()
const products = []
const orders = []
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null
const app = express()

function isAllowedAdminOrigin(origin) {
  if (origin === webOrigin) return true

  try {
    const requestOrigin = new URL(origin)
    const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
    return requestOrigin.protocol === configuredWebUrl.protocol
      && requestOrigin.port === configuredWebUrl.port
      && loopbackHosts.has(requestOrigin.hostname)
      && loopbackHosts.has(configuredWebUrl.hostname)
  } catch {
    return false
  }
}

if (password.length < 16) {
  console.error('Admin server not started: set ADMIN_PASSWORD to a unique passphrase of at least 16 characters in .env.')
  process.exit(1)
}

app.disable('x-powered-by')
app.use(express.json({ limit: '12mb' }))
app.use((request, response, next) => {
  response.set('Cache-Control', 'no-store')
  if (request.headers.origin && !isAllowedAdminOrigin(request.headers.origin)) {
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
  const editorContent = product.editor_content && typeof product.editor_content === 'object' ? product.editor_content : {}
  const editorImages = Array.isArray(editorContent.images) ? editorContent.images : []
  const inventory = Array.isArray(product.inventory) ? product.inventory : []
  const stockTotal = inventory.reduce((total, entry) => {
    const value = Number(entry?.stock ?? entry?.quantity ?? entry?.available ?? 0)
    return total + (Number.isFinite(value) ? value : 0)
  }, 0)

  const imageCandidates = Array.isArray(product.images) ? product.images : []
  const firstImage = imageCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || product.image || ''

  return {
    id: String(product.cj_product_id ?? product.id ?? ''),
    name: editorContent.title || product.name || 'Untitled product',
    category: product.category ?? 'Uncategorized',
    sku: product.sku ?? '',
    price: Number(product.price ?? 0),
    stock: Math.max(0, stockTotal),
    image: editorContent.primaryImage || editorImages[0]?.url || firstImage,
    isActive: product.editor_status === 'PUBLISHED',
    editorStatus: PRODUCT_EDITOR_STATUSES.includes(product.editor_status) ? product.editor_status : 'QUEUED',
    editorContent,
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
      supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true }),
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

async function deleteProduct(productId) {
  if (!supabase) {
    const productIndex = products.findIndex((item) => item.id === productId)
    if (productIndex === -1) return null
    return products.splice(productIndex, 1)[0]
  }

  const { data, error } = await supabase
    .from('products')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('is_active', true)
    .select('id')
    .maybeSingle()
  if (error) throw error
  return data
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

function getCJVariantRecords(response) {
  const data = response && typeof response === 'object' && 'data' in response ? response.data : response
  if (Array.isArray(data)) return data
  return [data?.variants, data?.variantList, data?.list, data?.records, data?.content].find(Array.isArray) || []
}

async function writeProductEditorHistory(productId, action, beforeData, afterData) {
  const { error } = await supabase.from('product_editor_history').insert({
    cj_product_id: productId,
    action,
    actor: adminActor,
    before_data: beforeData || {},
    after_data: afterData || {},
  })
  if (error) throw error
}

async function getProductEditorRow(productId) {
  const { data, error } = await supabase
    .from('cj_products')
    .select('*')
    .eq('cj_product_id', productId)
    .maybeSingle()
  if (error) throw error
  return data
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
  const [variantResponse, inventoryResponse] = await Promise.all([
    getProductVariants({ productId }),
    getProductInventory({ productId }),
  ])
  const variants = getCJVariantRecords(variantResponse)
  const inventory = normalizeCJInventoryResponse(inventoryResponse)
  const payload = buildCJProductImportPayload(productDetail, variants, inventory)
  if (!payload.cjProductId) throw new Error('CJ product details did not include a stable supplier product ID.')

  const now = new Date().toISOString()
  const existing = await getProductEditorRow(payload.cjProductId)
  const supplierData = {
    product: productDetail,
    variants: variants,
    inventory: inventoryResponse,
  }
  const supplierFields = {
    name: payload.name,
    description: payload.description,
    category: payload.category,
    sku: payload.sku,
    price: payload.price,
    images: payload.images,
    variants: payload.variants,
    inventory: payload.inventory,
    supplier_data: supplierData,
    updated_at: now,
  }
  let data

  if (existing) {
    const { error } = await supabase
      .from('cj_products')
      .update(supplierFields)
      .eq('cj_product_id', payload.cjProductId)
    if (error) throw error
    data = await getProductEditorRow(payload.cjProductId)
    await writeProductEditorHistory(payload.cjProductId, 'SUPPLIER_REFRESHED', {
      inventory: existing.inventory,
      variants: existing.variants,
    }, {
      inventory: payload.inventory,
      variants: payload.variants,
    })
  } else {
    const editorContent = createProductEditorContent(payload)
    const { data: inserted, error } = await supabase
      .from('cj_products')
      .insert({
        cj_product_id: payload.cjProductId,
        public_product_id: randomUUID(),
        ...supplierFields,
        original_data: supplierData,
        editor_content: editorContent,
        editor_status: 'QUEUED',
        is_active: false,
        source: 'cj',
      })
      .select()
      .single()
    if (error) throw error
    data = inserted
    await writeProductEditorHistory(payload.cjProductId, 'IMPORTED', {}, {
      original_data: supplierData,
      editor_status: 'QUEUED',
    })
  }

  await supabase.from('sync_logs').insert({
    entity_type: 'cj_product',
    entity_id: payload.cjProductId,
    status: 'success',
    message: existing
      ? 'CJ supplier information refreshed without replacing product editor content.'
      : 'CJ product added to the private Product Editor queue.',
    payload: {
      productId: payload.cjProductId,
      importedAt: now,
      supplierCategory: productDetail.categoryName || null,
      morrowHouseCategory: payload.category,
    },
  })

  return data || payload
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

function mergeVariantInventory(variants, inventory) {
  const stockByVariant = new Map((Array.isArray(inventory) ? inventory : []).map((entry) => [String(entry.cjVariantId || ''), Math.max(0, Number(entry.stock) || 0)]))
  return (Array.isArray(variants) ? variants : []).map((variant) => {
    const variantId = String(variant.cjVariantId || '')
    return stockByVariant.has(variantId) ? { ...variant, stock: stockByVariant.get(variantId) } : variant
  })
}

async function saveProductEditorContent(productId, content) {
  const validatedContent = validateProductEditorContent(content)
  const current = await getProductEditorRow(productId)
  if (!current) return null

  const nextStatus = ['PUBLISHED', 'ARCHIVED', 'REJECTED', 'QUEUED', 'READY_TO_PUBLISH'].includes(current.editor_status)
    ? 'EDITING'
    : current.editor_status
  if (current.editor_status === 'PUBLISHED') {
    const { error: storefrontError } = await supabase.from('products').update({ is_active: false }).eq('id', current.public_product_id)
    if (storefrontError) throw storefrontError
  }

  const { data, error } = await supabase
    .from('cj_products')
    .update({
      editor_content: validatedContent,
      editor_status: nextStatus === 'READY_TO_PUBLISH' ? 'EDITING' : nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('cj_product_id', productId)
    .select()
    .single()
  if (error) throw error

  await writeProductEditorHistory(productId, 'CONTENT_SAVED', {
    editor_content: current.editor_content || {},
    editor_status: current.editor_status,
  }, {
    editor_content: validatedContent,
    editor_status: data.editor_status,
  })
  return data
}

async function changeProductEditorStatus(productId, status) {
  if (!PRODUCT_EDITOR_STATUSES.includes(status) || status === 'PUBLISHED') {
    throw new Error('Choose a valid product workflow status.')
  }
  const current = await getProductEditorRow(productId)
  if (!current) return null
  if (status === 'READY_TO_PUBLISH' && !getProductReadiness(current.editor_content, current).ready) {
    throw new Error('Complete every product readiness check before moving it to Ready to Publish.')
  }

  if (['QUEUED', 'ARCHIVED', 'REJECTED'].includes(status) || current.editor_status === 'PUBLISHED') {
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', current.public_product_id)
    if (error) throw error
  }

  const { data, error } = await supabase
    .from('cj_products')
    .update({
      editor_status: status,
      is_active: status === 'PUBLISHED',
      updated_at: new Date().toISOString(),
    })
    .eq('cj_product_id', productId)
    .select()
    .single()
  if (error) throw error

  await writeProductEditorHistory(productId, 'STATUS_CHANGED', {
    editor_status: current.editor_status,
  }, {
    editor_status: data.editor_status,
  })
  return data
}

async function publishProductEditorProduct(productId) {
  const current = await getProductEditorRow(productId)
  if (!current) return null
  if (current.editor_status !== 'READY_TO_PUBLISH') {
    throw new Error('Move this product to Ready to Publish after completing its checklist.')
  }
  const readiness = getProductReadiness(current.editor_content, current)
  if (!readiness.ready) throw new Error('Complete every product readiness check before publishing.')
  const content = validateProductEditorContent(current.editor_content)
  const publicProduct = buildPublicProductRecord(current, content)
  publicProduct.updated_at = new Date().toISOString()

  const { error: draftError } = await supabase
    .from('products')
    .upsert({ ...publicProduct, is_active: false }, { onConflict: 'id' })
  if (draftError) throw draftError

  const publishedAt = new Date().toISOString()
  const { data: updatedEditorProduct, error: publishError } = await supabase
    .from('cj_products')
    .update({
      editor_status: 'PUBLISHED',
      is_active: true,
      published_at: publishedAt,
      published_by: adminActor,
      updated_at: publishedAt,
    })
    .eq('cj_product_id', productId)
    .eq('editor_status', 'READY_TO_PUBLISH')
    .select()
    .single()
  if (publishError) throw publishError

  const { error: activateError } = await supabase
    .from('products')
    .update({ is_active: true, updated_at: publishedAt })
    .eq('id', current.public_product_id)
  if (activateError) {
    await supabase.from('cj_products').update({ editor_status: 'READY_TO_PUBLISH', is_active: false }).eq('cj_product_id', productId)
    throw activateError
  }

  await writeProductEditorHistory(productId, 'PUBLISHED', {
    editor_status: current.editor_status,
  }, {
    editor_status: 'PUBLISHED',
    published_at: publishedAt,
    published_by: adminActor,
  })
  return updatedEditorProduct
}

function validateUploadedImage(buffer, mimeType) {
  const signatures = {
    'image/jpeg': buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    'image/png': buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
    'image/avif': buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(buffer.toString('ascii', 8, 12)),
  }
  return signatures[mimeType] === true
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

app.get('/api/admin/product-editor', async (_request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Product Editor requires the connected Supabase database.' })
  try {
    const { data, error } = await supabase
      .from('cj_products')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    response.json({
      products: (data || []).map((product) => ({
        ...normalizeCJProduct(product),
        supplierCost: Number(product.price || 0),
        supplierSku: product.sku || '',
        originalData: product.original_data || {},
        supplierData: product.supplier_data || {},
        publishedAt: product.published_at || null,
        publishedBy: product.published_by || null,
        readiness: getProductReadiness(product.editor_content, product),
      })),
    })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Product Editor records could not be loaded.' })
  }
})

app.get('/api/admin/product-editor/:productId/history', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Product Editor requires the connected Supabase database.' })
  try {
    const { data, error } = await supabase
      .from('product_editor_history')
      .select('id, action, actor, before_data, after_data, created_at')
      .eq('cj_product_id', request.params.productId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    response.json({ history: data || [] })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Product history could not be loaded.' })
  }
})

app.post('/api/admin/product-editor/:productId/images', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Product image storage requires the connected Supabase database.' })
  const { base64, mimeType, fileName } = request.body || {}
  if (typeof base64 !== 'string' || typeof mimeType !== 'string') {
    return response.status(400).json({ error: 'Choose a supported product image to upload.' })
  }
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  if (!allowedTypes.has(mimeType)) return response.status(400).json({ error: 'Upload a JPEG, PNG, WebP or AVIF image.' })
  const encoded = base64.replace(/^data:image\/(?:jpeg|png|webp|avif);base64,/i, '')
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded)) return response.status(400).json({ error: 'The image upload is not valid base64 data.' })
  const image = Buffer.from(encoded, 'base64')
  if (!image.length || image.length > 10 * 1024 * 1024 || !validateUploadedImage(image, mimeType)) {
    return response.status(400).json({ error: 'Image must be valid and no larger than 10 MB.' })
  }

  const productId = String(request.params.productId)
  try {
    if (!await getProductEditorRow(productId)) return response.status(404).json({ error: 'Product not found in Product Editor.' })
    const safeProductId = productId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[mimeType]
    const path = `${safeProductId}/${Date.now()}-${randomBytes(6).toString('hex')}.${extension}`
    const { error } = await supabase.storage
      .from('product-editor-images')
      .upload(path, image, { contentType: mimeType, upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('product-editor-images').getPublicUrl(path)
    response.json({ image: { url: data.publicUrl, alt: String(fileName || '').slice(0, 300), source: 'upload' } })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Product image could not be uploaded.' })
  }
})

app.patch('/api/admin/product-editor/:productId', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Product Editor requires the connected Supabase database.' })
  try {
    const product = await saveProductEditorContent(request.params.productId, request.body?.content)
    if (!product) return response.status(404).json({ error: 'Product not found in Product Editor.' })
    response.json({ product: normalizeCJProduct(product), readiness: getProductReadiness(product.editor_content, product) })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Product edits could not be saved.' })
  }
})

app.post('/api/admin/product-editor/:productId/status', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Product Editor requires the connected Supabase database.' })
  try {
    const product = await changeProductEditorStatus(request.params.productId, request.body?.status)
    if (!product) return response.status(404).json({ error: 'Product not found in Product Editor.' })
    response.json({ product: normalizeCJProduct(product) })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Product status could not be changed.' })
  }
})

app.post('/api/admin/product-editor/:productId/publish', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Product Editor requires the connected Supabase database.' })
  try {
    const product = await publishProductEditorProduct(request.params.productId)
    if (!product) return response.status(404).json({ error: 'Product not found in Product Editor.' })
    response.json({ product: normalizeCJProduct(product) })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Product could not be published.' })
  }
})

app.post('/api/admin/product-editor/:productId/history/:historyId/restore', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Product Editor requires the connected Supabase database.' })
  try {
    const { data: history, error } = await supabase
      .from('product_editor_history')
      .select('after_data')
      .eq('id', request.params.historyId)
      .eq('cj_product_id', request.params.productId)
      .single()
    if (error) throw error
    const content = history?.after_data?.editor_content
    if (!content) return response.status(400).json({ error: 'This history entry does not contain a restorable product draft.' })
    const product = await saveProductEditorContent(request.params.productId, content)
    if (!product) return response.status(404).json({ error: 'Product not found in Product Editor.' })
    response.json({ product: normalizeCJProduct(product) })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Product version could not be restored.' })
  }
})

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
    const supplierProduct = await getProductEditorRow(productId)
    if (!supplierProduct) return response.status(404).json({ error: 'Imported CJ product not found.' })

    const inventoryResponse = await getProductInventory({ productId })
    const inventory = normalizeCJInventoryResponse(inventoryResponse)
    if (!inventory.length) throw new Error('CJ returned no inventory records for this product.')
    const editorContent = supplierProduct.editor_content && typeof supplierProduct.editor_content === 'object'
      ? supplierProduct.editor_content
      : createProductEditorContent(supplierProduct)
    const beforeVariants = Array.isArray(editorContent.variants) ? editorContent.variants : []
    const updatedContent = {
      ...editorContent,
      variants: mergeVariantInventory(beforeVariants, inventory),
    }

    const { data, error } = await supabase
      .from('cj_products')
      .update({
        inventory,
        variants: inventory,
        editor_content: updatedContent,
        updated_at: new Date().toISOString(),
      })
      .eq('cj_product_id', productId)
      .select()
      .single()

    if (error) throw error
    if (supplierProduct.editor_status === 'PUBLISHED') {
      const publicProduct = buildPublicProductRecord({ ...supplierProduct, inventory }, updatedContent)
      const { error: storefrontError } = await supabase
        .from('products')
        .update({
          stock: publicProduct.stock,
          public_data: publicProduct.public_data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplierProduct.public_product_id)
      if (storefrontError) throw storefrontError
    }
    await writeProductEditorHistory(productId, 'INVENTORY_SYNCED', {
      inventory: supplierProduct.inventory,
    }, {
      inventory,
    })
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
  response.status(410).json({ error: 'Direct supplier approval is disabled. Edit the product, complete its checklist, and publish it from Product Editor.' })
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

app.delete('/api/admin/products/:productId', async (request, response) => {
  const productId = String(request.params.productId || '').trim()
  if (!productId) {
    return response.status(400).json({ error: 'A product ID is required.' })
  }

  try {
    const product = await deleteProduct(productId)
    if (!product) return response.status(404).json({ error: 'Product not found.' })
    response.json({ ok: true, productId })
  } catch (error) {
    console.error('Admin product deletion failed:', error.message || error)
    response.status(500).json({ error: error.message || 'The product could not be deleted.' })
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
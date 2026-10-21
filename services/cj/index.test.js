import test from 'node:test'
import assert from 'node:assert/strict'

async function loadFreshModule(envOverrides = {}) {
  const previous = {
    CJ_API_BASE_URL: process.env.CJ_API_BASE_URL,
    CJ_ACCESS_TOKEN: process.env.CJ_ACCESS_TOKEN,
    CJ_API_KEY: process.env.CJ_API_KEY,
    CJ_API_SECRET: process.env.CJ_API_SECRET,
  }

  Object.assign(process.env, {
    CJ_API_BASE_URL: '',
    CJ_ACCESS_TOKEN: '',
    CJ_API_KEY: '',
    CJ_API_SECRET: '',
    ...envOverrides,
  })

  const moduleUrl = `./index.js?test=${Date.now()}-${Math.random().toString(16).slice(2)}`
  const loaded = await import(moduleUrl)

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  return loaded
}

test('CJ config reports whether credentials are set', async () => {
  const { getCJConfig } = await loadFreshModule({ CJ_API_BASE_URL: 'https://example.test', CJ_API_KEY: 'example-key', CJ_API_SECRET: 'example-secret' })
  const config = getCJConfig()

  assert.equal(config.baseUrl, 'https://example.test')
  assert.equal(config.configured, true)
  assert.equal(config.hasApiKey, true)
  assert.equal(config.hasApiSecret, true)
})

test('CJ headers throw when no server credentials are available', async () => {
  const { getCJHeaders } = await loadFreshModule()

  assert.throws(() => getCJHeaders(), /not configured/i)
})

test('CJ health status remains safe without configured credentials', async () => {
  const { getCJHealthStatus } = await loadFreshModule()
  const status = getCJHealthStatus()

  assert.equal(status.configured, false)
  assert.match(status.note, /CJ_API_BASE_URL/i)
})

test('CJ product helpers require a configured endpoint before making a request', async () => {
  const { searchProducts } = await loadFreshModule()

  await assert.rejects(() => searchProducts({ query: 'lamp' }), /endpoint is not configured/i)
})

test('CJ product search sends a live keyword request and normalizes listV2 results', async () => {
  const previousFetch = global.fetch
  global.fetch = async (url, options) => {
    const parsedUrl = new URL(String(url))
    assert.equal(parsedUrl.pathname, '/api2.0/v1/product/listV2')
    assert.equal(parsedUrl.searchParams.get('keyWord'), 'table lamp')
    assert.equal(parsedUrl.searchParams.get('pageNum'), '1')
    assert.equal(options.headers['CJ-Access-Token'], 'demo-token')
    return {
      ok: true,
      text: async () => JSON.stringify({
        code: 200,
        result: true,
        data: {
          pageNumber: 1,
          totalRecords: 1,
          content: [{
            productList: [{
              id: 'cj-lamp-1',
              nameEn: 'Ceramic Table Lamp',
              sku: 'CJ-LAMP-1',
              threeCategoryName: 'Home Lighting',
              sellPrice: '18.50-22.00',
              bigImage: 'https://cdn.example.com/lamp.jpg',
            }],
          }],
        },
      }),
    }
  }

  try {
    const { searchProducts, normalizeCJProductSearchResults } = await loadFreshModule({
      CJ_API_BASE_URL: 'https://developers.cjdropshipping.com/api2.0/v1',
      CJ_ACCESS_TOKEN: 'demo-token',
    })
    const response = await searchProducts({ query: 'table lamp', filters: { pageNum: 1, pageSize: 20 } })
    const products = normalizeCJProductSearchResults(response)

    assert.equal(products.length, 1)
    assert.equal(products[0].id, 'cj-lamp-1')
    assert.equal(products[0].name, 'Ceramic Table Lamp')
    assert.equal(products[0].price, 18.5)
    assert.equal(products[0].image, 'https://cdn.example.com/lamp.jpg')
  } finally {
    global.fetch = previousFetch
  }
})

test('CJ inventory lookup sends the product ID and normalizes verified stock', async () => {
  const previousFetch = global.fetch
  global.fetch = async (url, options) => {
    const parsedUrl = new URL(String(url))
    assert.equal(parsedUrl.pathname, '/api2.0/v1/product/stock/getInventoryByPid')
    assert.equal(parsedUrl.searchParams.get('pid'), 'cj-product-1')
    assert.equal(options.method, 'GET')
    return {
      ok: true,
      text: async () => JSON.stringify({
        code: 200,
        result: true,
        data: {
          inventories: [{ countryCode: 'CN', totalInventoryNum: 18 }],
          variantInventories: [
            { vid: 'variant-1', inventory: [{ stock: [{ inventory: 3, factoryInventory: 4 }, { inventory: 0, factoryInventory: 2 }] }] },
            { vid: 'variant-2', inventory: [{ stock: [{ inventory: 4, factoryInventory: 5 }] }] },
          ],
        },
      }),
    }
  }

  try {
    const { getProductInventory, normalizeCJInventoryResponse } = await loadFreshModule({
      CJ_API_BASE_URL: 'https://developers.cjdropshipping.com/api2.0/v1',
      CJ_ACCESS_TOKEN: 'demo-token',
    })
    const response = await getProductInventory({ productId: 'cj-product-1' })
    const inventory = normalizeCJInventoryResponse(response)

    assert.deepEqual(inventory.map((entry) => [entry.cjVariantId, entry.stock]), [
      ['variant-1', 9],
      ['variant-2', 9],
    ])
  } finally {
    global.fetch = previousFetch
  }
})

test('CJ import payload normalizes supplier details into a backend-safe record', async () => {
  const { buildCJProductImportPayload } = await loadFreshModule({ CJ_API_BASE_URL: 'https://example.test', CJ_API_KEY: 'example-key', CJ_API_SECRET: 'example-secret' })

  const payload = buildCJProductImportPayload({
    id: 'cj-123',
    name: 'Lune Chair',
    category: 'Home decor',
    description: 'A soft lounge chair',
    images: [{ imageUrl: 'https://example.test/1.jpg' }],
    price: 199,
    variants: [{ id: 'v-1', sku: 'LUNE-01', stock: 12, price: 199 }],
    inventory: [{ variantId: 'v-1', stock: 12 }],
  })

  assert.equal(payload.cjProductId, 'cj-123')
  assert.equal(payload.name, 'Lune Chair')
  assert.equal(payload.category, 'Living')
  assert.equal(payload.images.length, 1)
  assert.equal(payload.variants[0].cjVariantId, 'v-1')
  assert.equal(payload.isActive, false)
  assert.equal(payload.inventory[0].stock, 12)
})

test('CJ import payload maps the official product query response into the review queue contract', async () => {
  const { buildCJProductImportPayload } = await loadFreshModule()

  const payload = buildCJProductImportPayload({
    pid: '1463036925509242880',
    productNameEn: 'Crystal Ball Salt Stone Moisturizing And Humidifying',
    productSku: 'CJJT1360421',
    categoryName: 'Home & Garden, Home Decor',
    bigImage: 'https://cdn.example.com/salt-stone.jpg',
    productImageSet: ['https://cdn.example.com/salt-stone.jpg'],
    sellPrice: '5.68-6.67',
    variants: [
      { vid: 'variant-1', variantSku: 'CJJT136042101AZ', variantNameEn: 'White', variantSellPrice: 5.68, inventoryNum: null },
    ],
  })

  assert.equal(payload.cjProductId, '1463036925509242880')
  assert.equal(payload.name, 'Crystal Ball Salt Stone Moisturizing And Humidifying')
  assert.equal(payload.category, 'Objects')
  assert.equal(payload.sku, 'CJJT1360421')
  assert.equal(payload.price, 5.68)
  assert.equal(payload.images[0], 'https://cdn.example.com/salt-stone.jpg')
  assert.equal(payload.variants[0].cjVariantId, 'variant-1')
  assert.equal(payload.variants[0].sku, 'CJJT136042101AZ')
  assert.equal(payload.inventory[0].stock, 0)
  assert.equal(payload.isActive, false)
})

test('CJ approval mapping converts an imported supplier row into the storefront product contract', async () => {
  const { buildApprovedMorrowHouseProduct } = await loadFreshModule({ CJ_API_BASE_URL: 'https://example.test', CJ_API_KEY: 'example-key', CJ_API_SECRET: 'example-secret' })

  const product = buildApprovedMorrowHouseProduct({
    cj_product_id: 'cj-123',
    name: 'Lune Chair',
    category: 'Home decor',
    sku: 'LUNE-01',
    price: 199,
    images: ['https://example.test/1.jpg'],
    inventory: [{ cjVariantId: 'v-1', stock: 12 }],
    is_active: true,
  })

  assert.equal(product.id, 'cj-123')
  assert.equal(product.name, 'Lune Chair')
  assert.equal(product.category, 'Home decor')
  assert.equal(product.price_cents, 19900)
  assert.equal(product.stock, 12)
  assert.equal(product.image, 'https://example.test/1.jpg')
  assert.equal(product.is_active, true)
})

test('CJ products are assigned to the closest Morrow House storefront category', async () => {
  const { classifyMorrowHouseCategory } = await loadFreshModule()

  assert.equal(classifyMorrowHouseCategory({ productNameEn: 'Ceramic Table Lamp', categoryName: 'Home Lighting' }), 'Lighting')
  assert.equal(classifyMorrowHouseCategory({ productNameEn: 'Linen Lounge Chair', categoryName: 'Home Furniture' }), 'Living')
  assert.equal(classifyMorrowHouseCategory({ productNameEn: 'Crystal Ball Salt Stone Humidifier', categoryName: 'Home Decor' }), 'Objects')
})

test('long product copy is made concise for customer-facing display', async () => {
  const { summarizeProductName, summarizeProductText } = await loadFreshModule()
  const longName = 'Cloud Modular Sofa Boneless L-Shaped Sofa, Modular Sofa With Ottoman, Modular Cloud Sofa, 3 Seater Corduroy Cloud Sofa For Living Room, Assembly-Free Sofa, Beige'
  const longDescription = '<p>Made for soft evenings. Upholstered in a durable woven fabric.</p><p>Extra supplier specifications and repeated marketing content that continue well beyond the useful customer summary and repeat details already stated elsewhere in the listing.</p>'

  assert.equal(summarizeProductName(longName), 'Modular Cloud Sofa')
  assert.equal(summarizeProductName('Crystal Ball Salt Stone Moisturizing And Humidifying'), 'Crystal Ball Salt Stone Humidifier')
  assert.equal(summarizeProductText(longDescription), 'Made for soft evenings. Upholstered in a durable woven fabric.')
  assert.equal(summarizeProductText('Short product detail.'), 'Short product detail.')
  assert.equal(summarizeProductText('<p><b>Product information:</b></p><p>Product model: A10<br>Water tank capacity: ≈300ml<br>Product name: crystal ball humidifier<br>Maximum battery life: ≈5 hours<br>Material: ABS + electronic components<br>Charging time: ≈2.5 hours<br>Power input: 5V/500mA<br>Product size: 107*107*163mm<br>Package includes: one humidifier and charging cable</p>'), 'Water tank capacity: ≈300ml. Maximum battery life: ≈5 hours')
})

test('CJ batch approval transforms an array of imported products into Morrow House catalog entries', async () => {
  const { buildApprovedMorrowHouseCatalog } = await loadFreshModule({ CJ_API_BASE_URL: 'https://example.test', CJ_API_KEY: 'example-key', CJ_API_SECRET: 'example-secret' })

  const catalog = buildApprovedMorrowHouseCatalog([
    {
      cj_product_id: 'cj-123',
      name: 'Lune Chair',
      category: 'Home decor',
      sku: 'LUNE-01',
      price: 199,
      images: ['https://example.test/1.jpg'],
      inventory: [{ stock: 12 }],
      is_active: true,
    },
    {
      cj_product_id: 'cj-456',
      name: 'Aster Lamp',
      category: 'Lighting',
      sku: 'ASTER-01',
      price: 89,
      images: ['https://example.test/2.jpg'],
      inventory: [{ stock: 25 }],
      is_active: true,
    },
  ])

  assert.equal(catalog.length, 2)
  assert.equal(catalog[0].id, 'cj-123')
  assert.equal(catalog[1].stock, 25)
  assert.equal(catalog[1].price_cents, 8900)
})

test('CJ sync summary reports imported and approved counts for the supplier pipeline', async () => {
  const { buildCJSyncSummary } = await loadFreshModule({ CJ_API_BASE_URL: 'https://example.test', CJ_API_KEY: 'example-key', CJ_API_SECRET: 'example-secret' })

  const summary = buildCJSyncSummary({
    imported: [{ cj_product_id: 'a' }, { cj_product_id: 'b' }, { cj_product_id: 'c' }],
    approved: [{ id: 'a' }, { id: 'b' }],
  })

  assert.equal(summary.importedCount, 3)
  assert.equal(summary.approvedCount, 2)
  assert.equal(summary.pendingCount, 1)
  assert.equal(summary.needsAttention, true)
})

test('CJ inventory sync converts supplier stock into the storefront stock contract', async () => {
  const { buildCJInventorySyncUpdate } = await loadFreshModule({ CJ_API_BASE_URL: 'https://example.test', CJ_API_KEY: 'example-key', CJ_API_SECRET: 'example-secret' })

  const update = buildCJInventorySyncUpdate({
    cj_product_id: 'cj-123',
    inventory: [{ cjVariantId: 'v-1', stock: 12 }, { cjVariantId: 'v-2', stock: 5 }],
    is_active: true,
  })

  assert.equal(update.id, 'cj-123')
  assert.equal(update.stock, 17)
  assert.equal(update.reorder_at, 5)
  assert.equal(update.is_active, true)
})

test('CJ SKU lookup normalizes the official product-detail response for admin review', async () => {
  const previousFetch = global.fetch
  global.fetch = async (url, options) => {
    assert.match(String(url), /product\/query/i)
    assert.equal(new URL(String(url)).pathname, '/api2.0/v1/product/query')
    assert.equal(options.headers['CJ-Access-Token'], 'demo-token')
    assert.equal(options.headers.Authorization, undefined)
    return {
      ok: true,
      text: async () => JSON.stringify({
        code: 200,
        result: true,
        message: 'Success',
        data: {
          productSku: 'CJJT136042101AZ',
          productNameEn: 'Morrow House Test Product',
          categoryName: 'Home & Garden > Decor',
          sellPrice: '29.99',
          productImage: 'https://cdn.example.com/product.jpg',
          description: '<p>Test product</p>',
          variants: [{ variantSku: 'CJJT136042101AZ-Black', variantSellPrice: 29.99 }],
        },
      }),
    }
  }

  try {
    const { lookupCJProductBySku } = await loadFreshModule({
      CJ_API_BASE_URL: 'https://developers.cjdropshipping.com/api2.0/v1',
      CJ_ACCESS_TOKEN: 'demo-token',
    })

    const result = await lookupCJProductBySku({ sku: 'CJJT136042101AZ' })

    assert.equal(result.sku, 'CJJT136042101AZ')
    assert.equal(result.name, 'Morrow House Test Product')
    assert.equal(result.price, 29.99)
    assert.equal(result.variants.length, 1)
    assert.equal(result.variants[0].sku, 'CJJT136042101AZ-Black')
  } finally {
    global.fetch = previousFetch
  }
})

test('CJ SKU lookup retries as a variant SKU when no product SKU matches', async () => {
  const previousFetch = global.fetch
  const queries = []
  global.fetch = async (url) => {
    const parsedUrl = new URL(String(url))
    queries.push(parsedUrl.searchParams.toString())
    const payload = parsedUrl.searchParams.has('productSku')
      ? { code: 1602001, result: false, message: 'Product not found', data: null }
      : {
          code: 200,
          result: true,
          message: 'Success',
          data: {
            pid: 'cj-product-1',
            productSku: 'CJ-PARENT-SKU',
            productNameEn: 'Variant Match Product',
            sellPrice: '5.68-6.67',
            variants: [{ vid: 'cj-variant-1', variantSku: 'CJJT136042101AZ', variantSellPrice: 29.99 }],
          },
        }

    return { ok: true, text: async () => JSON.stringify(payload) }
  }

  try {
    const { lookupCJProductBySku } = await loadFreshModule({
      CJ_API_BASE_URL: 'https://developers.cjdropshipping.com/api2.0/v1',
      CJ_ACCESS_TOKEN: 'demo-token',
    })
    const result = await lookupCJProductBySku({ sku: 'CJJT136042101AZ' })

    assert.deepEqual(queries, ['productSku=CJJT136042101AZ', 'variantSku=CJJT136042101AZ'])
    assert.equal(result.id, 'cj-product-1')
    assert.equal(result.sku, 'CJ-PARENT-SKU')
    assert.equal(result.price, 5.68)
    assert.equal(result.variants[0].sku, 'CJJT136042101AZ')
  } finally {
    global.fetch = previousFetch
  }
})

test('CJ bulk sync plan turns every imported supplier record into a storefront inventory update', async () => {
  const { buildCJBulkSyncPlan } = await loadFreshModule({ CJ_API_BASE_URL: 'https://example.test', CJ_API_KEY: 'example-key', CJ_API_SECRET: 'example-secret' })

  const plan = buildCJBulkSyncPlan([
    { cj_product_id: 'cj-123', inventory: [{ stock: 12 }], is_active: true },
    { cj_product_id: 'cj-456', inventory: [{ stock: 3 }, { stock: 4 }], is_active: false },
  ])

  assert.equal(plan.length, 2)
  assert.equal(plan[0].stock, 12)
  assert.equal(plan[1].stock, 7)
  assert.equal(plan[1].is_active, false)
})

test('CJ order payload maps a storefront order into the supplier order contract', async () => {
  const { buildCJOrderPayload } = await loadFreshModule({ CJ_API_BASE_URL: 'https://example.test', CJ_API_KEY: 'example-key', CJ_API_SECRET: 'example-secret' })

  const payload = buildCJOrderPayload({
    productId: 'cj-123',
    quantity: 2,
    customerName: 'Aisha Johnson',
    shippingAddress: {
      name: 'Aisha Johnson',
      line1: '5 Willow Lane',
      city: 'Houston',
      state: 'TX',
      postalCode: '77002',
      country: 'US',
    },
  })

  assert.equal(payload.productId, 'cj-123')
  assert.equal(payload.quantity, 2)
  assert.equal(payload.shippingAddress.city, 'Houston')
  assert.equal(payload.notes, 'Order created by Morrow House backend.')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPublicProductRecord,
  createProductEditorContent,
  getProductReadiness,
  validateProductEditorContent,
} from './product-editor.js'

test('imported supplier information creates a private queued editor draft', () => {
  const content = createProductEditorContent({
    name: 'Woven basket',
    description: 'Original supplier description',
    price: 18.5,
    images: ['https://cdn.example.com/basket.jpg'],
  })

  assert.equal(content.title, 'Woven basket')
  assert.equal(content.pricing.supplierCost, 18.5)
  assert.equal(content.pricing.sellingPrice, 0)
  assert.equal(content.primaryImage, 'https://cdn.example.com/basket.jpg')
  assert.equal(getProductReadiness(content).ready, false)
})

test('readiness requires all editorial, quality, price, image and SEO checks', () => {
  const content = createProductEditorContent({ images: ['https://cdn.example.com/item.jpg'] })
  Object.assign(content, {
    title: 'Considered storage basket',
    description: 'A beautifully made storage basket for considered spaces at home.',
    category: 'Organization & Storage',
    primaryImage: 'https://cdn.example.com/item.jpg',
    seo: { title: 'Considered Storage Basket', description: 'A woven storage basket for a considered and beautifully organised home.' },
    pricing: { ...content.pricing, sellingPrice: 45 },
    quality: {
      imagesReviewed: true,
      specificationsReviewed: true,
      variantsReviewed: true,
      inventoryReviewed: true,
      shippingReviewed: true,
      previewReviewed: true,
    },
  })

  assert.equal(getProductReadiness(content).percentage, 100)
  assert.equal(getProductReadiness(content).ready, true)
})

test('publishing payload excludes supplier identifiers and internal prices', () => {
  const content = createProductEditorContent({ images: ['https://cdn.example.com/item.jpg'] })
  Object.assign(content, {
    title: 'Considered storage basket',
    description: 'A beautifully made storage basket for considered spaces at home.',
    category: 'Organization & Storage',
    primaryImage: 'https://cdn.example.com/item.jpg',
    pricing: { supplierCost: 12, shippingCost: 3, additionalCost: 2, sellingPrice: 45, discountedPrice: 40, currency: 'USD' },
  })
  content.variants = [{ name: 'Natural / Small', cjVariantId: 'private-id', sku: 'private-sku', stock: 3, price: 45 }]

  const record = buildPublicProductRecord({
    cj_product_id: 'cj-123',
    public_product_id: 'public-uuid-123',
    sku: 'supplier-sku',
    inventory: [{ stock: 3 }],
  }, content)

  assert.equal(record.id, 'public-uuid-123')
  assert.notEqual(record.sku, 'supplier-sku')
  assert.equal(record.id.includes('cj-123'), false)
  assert.equal(record.name, 'Considered storage basket')
  assert.equal(record.price_cents, 4000)
  assert.equal(record.public_detail, content.description)
  assert.deepEqual(record.public_data.variants.map(({ name, stock }) => ({ name, stock })), [{ name: 'Natural / Small', stock: 3 }])
  assert.equal(JSON.stringify(record.public_data).includes('private-id'), false)
  assert.equal(JSON.stringify(record.public_data).includes('supplierCost'), false)
})

test('product editor validation rejects invalid pricing and public image URLs', () => {
  const content = createProductEditorContent()

  assert.throws(() => validateProductEditorContent({
    ...content,
    pricing: { ...content.pricing, sellingPrice: -1 },
  }), /between 0 and 999,999/i)
  assert.throws(() => validateProductEditorContent({
    ...content,
    images: [{ url: 'javascript:alert(1)', alt: '' }],
  }), /HTTP or HTTPS/i)
})

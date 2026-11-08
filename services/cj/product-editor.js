export const PRODUCT_EDITOR_STATUSES = Object.freeze([
  'QUEUED',
  'EDITING',
  'READY_TO_PUBLISH',
  'PUBLISHED',
  'ARCHIVED',
  'REJECTED',
])

export const PRODUCT_READINESS_ITEMS = Object.freeze([
  { key: 'title', label: 'Product title completed' },
  { key: 'description', label: 'Description completed' },
  { key: 'primaryImage', label: 'Primary image selected' },
  { key: 'imagesReviewed', label: 'Product images reviewed' },
  { key: 'price', label: 'Selling price configured' },
  { key: 'category', label: 'Product category selected' },
  { key: 'specificationsReviewed', label: 'Specifications reviewed' },
  { key: 'variantsReviewed', label: 'Variants checked' },
  { key: 'inventoryReviewed', label: 'Inventory checked' },
  { key: 'seo', label: 'SEO information completed' },
  { key: 'shippingReviewed', label: 'Shipping information reviewed' },
  { key: 'previewReviewed', label: 'Product preview inspected' },
])

export function createProductEditorContent(product = {}) {
  const images = Array.isArray(product.images)
    ? product.images.filter((url) => typeof url === 'string' && url.trim()).map((url) => ({ url, alt: '', source: 'supplier' }))
    : []

  return {
    title: String(product.name || 'Untitled product'),
    shortDescription: '',
    description: String(product.description || ''),
    category: String(product.category || 'Objects'),
    subcategory: '',
    tags: [],
    brand: '',
    productType: '',
    images,
    primaryImage: images[0]?.url || '',
    pricing: {
      supplierCost: Number(product.price) || 0,
      shippingCost: 0,
      additionalCost: 0,
      sellingPrice: 0,
      discountedPrice: null,
      currency: 'USD',
    },
    specifications: {},
    variants: Array.isArray(product.variants) ? product.variants : [],
    shipping: { reviewed: false, notes: '' },
    seo: { title: '', description: '', slug: '', keywords: [] },
    quality: {
      imagesReviewed: false,
      specificationsReviewed: false,
      variantsReviewed: false,
      inventoryReviewed: false,
      shippingReviewed: false,
      previewReviewed: false,
    },
  }
}

export function getProductReadiness(content = {}, product = null) {
  const pricing = content.pricing || {}
  const quality = content.quality || {}
  const seo = content.seo || {}
  const images = Array.isArray(content.images) ? content.images : []
  const primaryImage = String(content.primaryImage || '')
  const checks = {
    title: String(content.title || '').trim().length >= 3,
    description: String(content.description || '').trim().length >= 30,
    primaryImage: images.some((image) => image?.url === primaryImage),
    imagesReviewed: quality.imagesReviewed === true,
    price: Number.isFinite(Number(pricing.sellingPrice)) && Number(pricing.sellingPrice) > 0,
    category: Boolean(String(content.category || '').trim()),
    specificationsReviewed: quality.specificationsReviewed === true,
    variantsReviewed: quality.variantsReviewed === true
      && (Array.isArray(content.variants) ? content.variants : []).every((variant) => Boolean(String(variant?.name || '').trim() && String(variant?.cjVariantId || '').trim())),
    inventoryReviewed: quality.inventoryReviewed === true
      && (!product || (Array.isArray(product.inventory) ? product.inventory : []).some((entry) => Number(entry?.stock) > 0)),
    seo: String(seo.title || '').trim().length > 0 && String(seo.description || '').trim().length >= 50,
    shippingReviewed: quality.shippingReviewed === true,
    previewReviewed: quality.previewReviewed === true,
  }
  const completed = PRODUCT_READINESS_ITEMS.filter(({ key }) => checks[key]).length

  return {
    checks,
    completed,
    total: PRODUCT_READINESS_ITEMS.length,
    percentage: Math.round((completed / PRODUCT_READINESS_ITEMS.length) * 100),
    ready: completed === PRODUCT_READINESS_ITEMS.length,
  }
}

export function validateProductEditorContent(content = {}) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Product content must be an object.')
  }
  if (JSON.stringify(content).length > 500_000) {
    throw new Error('Product content is too large to save.')
  }

  for (const field of ['title', 'shortDescription', 'description', 'category', 'subcategory', 'brand', 'productType']) {
    if (content[field] !== undefined && (typeof content[field] !== 'string' || content[field].length > (field === 'description' ? 20000 : 500))) {
      throw new Error(`Product ${field} must be text within the allowed length.`)
    }
  }

  const pricing = content.pricing
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
    throw new Error('Product pricing information is required.')
  }
  for (const field of ['supplierCost', 'shippingCost', 'additionalCost', 'sellingPrice', 'discountedPrice']) {
    const value = pricing[field]
    if (value !== null && value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 999999)) {
      throw new Error(`Product ${field} must be between 0 and 999,999.`)
    }
  }
  if (pricing.discountedPrice != null && Number(pricing.discountedPrice) >= Number(pricing.sellingPrice)) {
    throw new Error('Discounted price must be lower than the selling price.')
  }

  if (!Array.isArray(content.images) || content.images.length > 40) {
    throw new Error('Product images must be a list of no more than 40 images.')
  }
  for (const image of content.images) {
    if (!image || typeof image.url !== 'string' || image.url.length > 2048 || !/^https?:\/\//i.test(image.url)) {
      throw new Error('Every product image must use a valid HTTP or HTTPS URL.')
    }
    if (typeof image.alt !== 'string' || image.alt.length > 300) {
      throw new Error('Image alt text must be 300 characters or fewer.')
    }
  }
  if (!Array.isArray(content.variants) || content.variants.length > 100) {
    throw new Error('Product variants must be a list of no more than 100 variants.')
  }
  for (const variant of content.variants) {
    if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
      throw new Error('Each product variant must be an object.')
    }
    for (const field of ['name', 'color', 'size', 'sku', 'cjVariantId', 'image']) {
      if (variant[field] !== undefined && (typeof variant[field] !== 'string' || variant[field].length > 500)) {
        throw new Error(`Variant ${field} must be text within the allowed length.`)
      }
    }
    for (const field of ['price', 'stock']) {
      if (variant[field] !== undefined && (!Number.isFinite(Number(variant[field])) || Number(variant[field]) < 0 || Number(variant[field]) > 999999)) {
        throw new Error(`Variant ${field} must be between 0 and 999,999.`)
      }
    }
  }
  if (!content.specifications || typeof content.specifications !== 'object' || Array.isArray(content.specifications)) {
    throw new Error('Product specifications must be key-value data.')
  }
  if (!content.seo || typeof content.seo !== 'object' || Array.isArray(content.seo)) {
    throw new Error('Product SEO information is required.')
  }
  if (!content.quality || typeof content.quality !== 'object' || Array.isArray(content.quality)) {
    throw new Error('Product review checklist information is required.')
  }

  return content
}

export function buildPublicProductRecord(product, content) {
  const publicProductId = String(product.public_product_id || '').trim()
  if (!publicProductId) {
    throw new Error('A public product identifier is required before publication.')
  }

  const pricing = content.pricing || {}
  const images = (Array.isArray(content.images) ? content.images : [])
    .filter((image) => image?.url && /^https?:\/\//i.test(image.url))
    .map(({ url, alt }) => ({ url, alt: String(alt || '').slice(0, 300) }))
  const variants = (Array.isArray(content.variants) ? content.variants : [])
    .map((variant, index) => ({
      id: String(index),
      name: String(variant?.name || '').slice(0, 200),
      color: String(variant?.color || '').slice(0, 100),
      size: String(variant?.size || '').slice(0, 100),
      price: Number(variant?.price) > 0 ? Number(variant.price) : Number(pricing.sellingPrice),
      stock: Math.max(0, Math.floor(Number(variant?.stock) || 0)),
      image: String(variant?.image || ''),
    }))
    .filter((variant) => variant.name)

  return {
    id: publicProductId,
    sku: `MH-${publicProductId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`,
    name: String(content.title),
    category: String(content.category),
    price_cents: Math.round(Number(pricing.discountedPrice || pricing.sellingPrice) * 100),
    stock: (Array.isArray(product.inventory) ? product.inventory : []).reduce((total, entry) => total + Math.max(0, Number(entry?.stock) || 0), 0),
    image: String(content.primaryImage),
    is_active: true,
    public_detail: String(content.description || ''),
    public_data: {
      shortDescription: String(content.shortDescription || ''),
      images,
      specifications: content.specifications,
      variants,
      seo: {
        title: String(content.seo.title || '').slice(0, 70),
        description: String(content.seo.description || '').slice(0, 160),
        slug: String(content.seo.slug || '').slice(0, 160),
        keywords: Array.isArray(content.seo.keywords) ? content.seo.keywords.map((keyword) => String(keyword).slice(0, 80)).slice(0, 30) : [],
      },
    },
  }
}

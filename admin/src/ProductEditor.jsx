import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CircleNotch, ClockCounterClockwise, Eye, FloppyDisk, Image, MagnifyingGlass, Package, Plus, RocketLaunch, Trash, WarningCircle, X } from '@phosphor-icons/react'
import { formatCurrency, imageUrl } from './format.js'

const statusTabs = [
  { id: 'OVERVIEW', label: 'Overview' },
  { id: 'QUEUED', label: 'Queue Products' },
  { id: 'EDITING', label: 'Editing' },
  { id: 'READY_TO_PUBLISH', label: 'Ready to Publish' },
  { id: 'PUBLISHED', label: 'Published' },
  { id: 'ARCHIVED', label: 'Archived' },
  { id: 'ALL', label: 'All Products' },
]

const readinessItems = [
  ['title', 'Product title completed'],
  ['description', 'Description completed'],
  ['primaryImage', 'Primary image selected'],
  ['imagesReviewed', 'Product images reviewed'],
  ['price', 'Selling price configured'],
  ['category', 'Product category selected'],
  ['specificationsReviewed', 'Specifications reviewed'],
  ['variantsReviewed', 'Variants checked'],
  ['inventoryReviewed', 'Inventory information checked'],
  ['seo', 'SEO information completed'],
  ['shippingReviewed', 'Shipping information reviewed'],
  ['previewReviewed', 'Product preview inspected'],
]

const OFFICIAL_CATEGORIES = [
  'Organization & Storage',
  'Bedroom & Comfort',
  'Home Décor',
  'Lighting',
  'Everyday Solutions',
]

function emptyContent(product) {
  const images = Array.isArray(product.images)
    ? product.images.filter((url) => typeof url === 'string').map((url) => ({ url, alt: '', source: 'supplier' }))
    : []
  return {
    title: product.name || 'Untitled product',
    shortDescription: '',
    description: product.description || '',
    category: product.category || 'Home Décor',
    subcategory: '',
    tags: [],
    brand: '',
    productType: '',
    images,
    primaryImage: images[0]?.url || '',
    pricing: { supplierCost: product.price || 0, shippingCost: 0, additionalCost: 0, sellingPrice: 0, discountedPrice: null, currency: 'USD' },
    specifications: {},
    variants: Array.isArray(product.variants) ? product.variants : [],
    shipping: { reviewed: false, notes: '' },
    seo: { title: '', description: '', slug: '', keywords: [] },
    quality: { imagesReviewed: false, specificationsReviewed: false, variantsReviewed: false, inventoryReviewed: false, shippingReviewed: false, previewReviewed: false },
  }
}

function getReadiness(content, product = null) {
  const pricing = content.pricing || {}
  const quality = content.quality || {}
  const images = Array.isArray(content.images) ? content.images : []
  const seo = content.seo || {}
  const checks = {
    title: String(content.title || '').trim().length >= 3,
    description: String(content.description || '').trim().length >= 30,
    primaryImage: images.some((entry) => entry.url === content.primaryImage),
    imagesReviewed: Boolean(quality.imagesReviewed),
    price: Number(pricing.sellingPrice) > 0,
    category: Boolean(String(content.category || '').trim()),
    specificationsReviewed: Boolean(quality.specificationsReviewed),
    variantsReviewed: Boolean(quality.variantsReviewed),
    inventoryReviewed: Boolean(quality.inventoryReviewed) && (!product || Number(product.stock) > 0),
    seo: Boolean(String(seo.title || '').trim() && String(seo.description || '').trim().length >= 50),
    shippingReviewed: Boolean(quality.shippingReviewed),
    previewReviewed: Boolean(quality.previewReviewed),
  }
  const completed = readinessItems.filter(([key]) => checks[key]).length
  return { checks, completed, total: readinessItems.length, percentage: Math.round(completed / readinessItems.length * 100), ready: completed === readinessItems.length }
}

function TextField({ label, value, onChange, ...props }) {
  return <label className="editor-field"><span>{label}</span><input value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props} /></label>
}

function TextAreaField({ label, value, onChange, ...props }) {
  return <label className="editor-field"><span>{label}</span><textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props} /></label>
}

function SelectField({ label, value, onChange, options = [], ...props }) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props}>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  )
}

export default function ProductEditor({
  products = [],
  error = '',
  onSearch,
  onImport,
  onRefreshSupplier,
  onSyncStock,
  onSave,
  onStatus,
  onPublish,
  onUploadImage,
  onHistory,
  onRestoreHistory,
}) {
  const [activeTab, setActiveTab] = useState('OVERVIEW')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [importingId, setImportingId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [content, setContent] = useState(null)
  const [editorSection, setEditorSection] = useState('Basic')
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState('')
  const [notice, setNotice] = useState('')
  const [localError, setLocalError] = useState('')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [draggedImage, setDraggedImage] = useState(-1)
  const selectedProduct = products.find((product) => product.id === selectedId)
  const readiness = content ? getReadiness(content, selectedProduct) : null
  const editorSections = ['Basic', 'Images', 'Pricing', 'Specifications', 'Variants', 'Reviews & promotions', 'SEO', 'Preview', 'History']
  const statusCounts = useMemo(() => products.reduce((counts, product) => {
    counts[product.editorStatus] = (counts[product.editorStatus] || 0) + 1
    return counts
  }, {}), [products])
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase()
    return products.filter((product) => {
      const matchesTab = activeTab === 'OVERVIEW' || activeTab === 'ALL' || product.editorStatus === activeTab
      const matchesCategory = categoryFilter === 'ALL' || product.category === categoryFilter
      const matchesQuery = !term || `${product.name} ${product.id} ${product.sku} ${product.category}`.toLowerCase().includes(term)
      return matchesTab && matchesCategory && matchesQuery
    })
  }, [activeTab, categoryFilter, products, query])
  const totalLandedCost = Number(content?.pricing?.supplierCost || 0) + Number(content?.pricing?.shippingCost || 0) + Number(content?.pricing?.additionalCost || 0)
  const sellingPrice = Number(content?.pricing?.sellingPrice || 0)
  const grossProfit = sellingPrice - totalLandedCost
  const grossMargin = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0

  useEffect(() => {
    if (!selectedProduct) {
      setContent(null)
      return
    }
    setContent(selectedProduct.editorContent && Object.keys(selectedProduct.editorContent).length
      ? structuredClone(selectedProduct.editorContent)
      : emptyContent(selectedProduct))
    setEditorSection('Basic')
    setNotice('')
    setLocalError('')
    setHistory([])
    setHistoryLoading(true)
    onHistory(selectedProduct.id)
      .then((result) => setHistory(result.history || []))
      .catch((historyError) => setLocalError(historyError.message || 'Product history could not be loaded.'))
      .finally(() => setHistoryLoading(false))
  }, [selectedId])

  function updateField(key, value) {
    setContent((current) => ({ ...current, [key]: value }))
  }

  function updateNested(group, key, value) {
    setContent((current) => ({ ...current, [group]: { ...(current[group] || {}), [key]: value } }))
  }

  async function searchCJ(event) {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    setResults([])
    try {
      const response = await onSearch(query.trim())
      setResults(response.products || [])
    } catch (requestError) {
      setSearchError(requestError.message || 'CJ search did not complete.')
    } finally {
      setSearching(false)
    }
  }

  async function perform(actionName, callback) {
    setAction(actionName)
    setLocalError('')
    setNotice('')
    try {
      await callback()
      setNotice(actionName === 'publish' ? 'Product published to the storefront.' : 'Product changes saved.')
    } catch (requestError) {
      setLocalError(requestError.message || 'Product action could not be completed.')
    } finally {
      setAction('')
    }
  }

  async function saveDraft() {
    if (!selectedProduct) return
    setSaving(true)
    try {
      await onSave(selectedProduct.id, content)
      setNotice('Draft saved. It remains private until you publish it.')
    } catch (requestError) {
      setLocalError(requestError.message || 'Product edits could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(file) {
    if (!file || !selectedProduct) return
    setLocalError('')
    try {
      const uploaded = await onUploadImage(selectedProduct.id, file)
      setContent((current) => ({
        ...current,
        images: [...current.images, uploaded.image],
        primaryImage: current.primaryImage || uploaded.image.url,
      }))
    } catch (uploadError) {
      setLocalError(uploadError.message || 'Image could not be uploaded.')
    }
  }

  async function handlePublish() {
    if (!selectedProduct) return
    if (selectedProduct.editorStatus !== 'READY_TO_PUBLISH') {
      setLocalError('Save your edits and move the product to Ready to Publish first.')
      return
    }
    await perform('publish', async () => {
      await onPublish(selectedProduct.id)
      setSelectedId('')
    })
  }

  async function changeStatus(status) {
    if (!selectedProduct) return
    const confirmed = ['ARCHIVED', 'REJECTED', 'QUEUED'].includes(status)
      ? window.confirm(`${status === 'QUEUED' ? 'Return this product to the queue' : `${status[0]}${status.slice(1).toLowerCase()} this product`}?`)
      : true
    if (!confirmed) return
    await perform(status, async () => {
      await onStatus(selectedProduct.id, status)
      if (['QUEUED', 'ARCHIVED', 'REJECTED'].includes(status)) setSelectedId('')
    })
  }

  async function addImageUrl() {
    const url = imageUrlInput.trim()
    if (!/^https?:\/\//i.test(url)) {
      setLocalError('Enter an image URL beginning with http:// or https://.')
      return
    }
    setContent((current) => ({
      ...current,
      images: [...current.images, { url, alt: '', source: 'administrator' }],
      primaryImage: current.primaryImage || url,
    }))
    setImageUrlInput('')
    setLocalError('')
  }

  function reorderImage(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    const images = [...content.images]
    const [image] = images.splice(fromIndex, 1)
    images.splice(toIndex, 0, image)
    updateField('images', images)
  }

  function setVariant(index, key, value) {
    const variants = [...content.variants]
    variants[index] = { ...variants[index], [key]: value }
    updateField('variants', variants)
  }

  if (selectedProduct && content) {
    const imageList = Array.isArray(content.images) ? content.images : []
    const specs = Object.entries(content.specifications || {})
    const variants = Array.isArray(content.variants) ? content.variants : []
    const activeImage = content.primaryImage || imageList[0]?.url || ''

    return (
      <section className="product-editor">
        <div className="editor-workspace-heading">
          <button type="button" className="editor-back-button" onClick={() => setSelectedId('')}><ArrowLeft size={16} /> Product list</button>
          <div className="editor-title-row"><div><span className="eyebrow">PRODUCT EDITOR · {selectedProduct.id}</span><h2>{content.title || 'Untitled product'}</h2><span className={`editor-status status-${selectedProduct.editorStatus.toLowerCase()}`}>{selectedProduct.editorStatus.replaceAll('_', ' ')}</span></div><div className="editor-action-row"><button type="button" className="editor-secondary-button" disabled={saving || Boolean(action)} onClick={saveDraft}><FloppyDisk size={14} />{saving ? 'Saving…' : 'Save draft'}</button>{selectedProduct.editorStatus !== 'READY_TO_PUBLISH' && <button type="button" className="editor-secondary-button" disabled={saving || Boolean(action) || !readiness.ready} onClick={() => perform('READY_TO_PUBLISH', async () => { await onSave(selectedProduct.id, content); await onStatus(selectedProduct.id, 'READY_TO_PUBLISH') })}><Check size={14} />Ready to publish</button>}{selectedProduct.editorStatus === 'READY_TO_PUBLISH' && <button type="button" className="editor-primary-button" disabled={Boolean(action)} onClick={handlePublish}>{action === 'publish' ? <CircleNotch className="spin" size={14} /> : <RocketLaunch size={14} />}Publish product</button>}</div></div>
          <div className="editor-readiness"><div><span>Product readiness</span><strong>{readiness.percentage}%</strong></div><div className="editor-readiness-track"><span style={{ width: `${readiness.percentage}%` }} /></div></div>
          <nav className="editor-section-tabs" aria-label="Product editing sections">{editorSections.map((section) => <button key={section} type="button" className={editorSection === section ? 'is-active' : ''} onClick={() => setEditorSection(section)}>{section}</button>)}</nav>
          {(notice || localError || error) && <div className={`editor-notice ${localError || error ? 'is-error' : ''}`} role={localError || error ? 'alert' : 'status'}>{localError || error ? <WarningCircle size={15} /> : <Check size={15} />}{localError || error || notice}</div>}

          {editorSection === 'Basic' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">STOREFRONT CONTENT</span><h3>Basic product information</h3></div><span className="editor-private-note">Supplier source is preserved separately</span></div><div className="editor-form-grid"><TextField label="Product title" value={content.title} onChange={(value) => updateField('title', value)} maxLength={200} /><SelectField label="Category" value={content.category || OFFICIAL_CATEGORIES[0]} onChange={(value) => updateField('category', value)} options={OFFICIAL_CATEGORIES} /><TextField label="Subcategory" value={content.subcategory} onChange={(value) => updateField('subcategory', value)} /><TextField label="Brand or manufacturer" value={content.brand} onChange={(value) => updateField('brand', value)} /><TextField label="Product type" value={content.productType} onChange={(value) => updateField('productType', value)} /><TextField label="Tags (comma separated)" value={(content.tags || []).join(', ')} onChange={(value) => updateField('tags', value.split(',').map((tag) => tag.trim()).filter(Boolean))} /><TextAreaField className="wide" label="Short description" value={content.shortDescription} onChange={(value) => updateField('shortDescription', value)} rows={2} maxLength={300} /><TextAreaField className="wide" label="Full product description" value={content.description} onChange={(value) => updateField('description', value)} rows={8} maxLength={20000} placeholder="Write verified product details. Do not add unconfirmed specifications." /></div><details className="editor-source-details"><summary>View original CJ source content</summary><p><strong>{selectedProduct.originalData?.product?.productNameEn || selectedProduct.originalData?.product?.name || selectedProduct.name}</strong></p><p>{selectedProduct.originalData?.product?.description || selectedProduct.description || 'No original description available.'}</p><small>Supplier ID: {selectedProduct.id} · Supplier SKU: {selectedProduct.supplierSku || 'Not provided'}</small></details></div>}

          {editorSection === 'Images' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">IMAGE STUDIO</span><h3>Choose the images customers see</h3></div><span className="editor-private-note">Supplier originals remain unchanged</span></div><div className="editor-image-primary">{activeImage ? <img src={imageUrl(activeImage, 1100)} alt={imageList.find((image) => image.url === activeImage)?.alt || content.title} /> : <div className="editor-image-empty"><Image size={24} />Add an image to continue</div>}<div><span>Primary image</span><strong>{imageList.findIndex((image) => image.url === activeImage) + 1} of {imageList.length || 0}</strong></div></div><div className="editor-image-add"><TextField label="Add image URL" value={imageUrlInput} onChange={setImageUrlInput} placeholder="https://…" /><button type="button" className="editor-secondary-button" onClick={addImageUrl}><Plus size={14} />Add URL</button><label className="editor-upload-button">Upload image<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { uploadImage(event.target.files?.[0]); event.target.value = '' }} /></label></div><div className="editor-image-grid">{imageList.map((image, index) => <article key={`${image.url}-${index}`} className={`editor-image-card${image.url === content.primaryImage ? ' is-primary' : ''}`} draggable onDragStart={() => setDraggedImage(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { reorderImage(draggedImage, index); setDraggedImage(-1) }}><img src={imageUrl(image.url, 400)} alt={image.alt || ''} /><span className="editor-image-source">{image.source || 'image'}</span><TextField label="Alt text" value={image.alt} onChange={(value) => updateField('images', imageList.map((entry, entryIndex) => entryIndex === index ? { ...entry, alt: value } : entry))} maxLength={300} /><div className="editor-image-actions"><button type="button" onClick={() => updateField('primaryImage', image.url)} aria-pressed={image.url === content.primaryImage}>{image.url === content.primaryImage ? 'Primary image' : 'Make primary'}</button><button type="button" aria-label="Move image up" disabled={!index} onClick={() => reorderImage(index, index - 1)}><ArrowUp size={13} /></button><button type="button" aria-label="Move image down" disabled={index === imageList.length - 1} onClick={() => reorderImage(index, index + 1)}><ArrowDown size={13} /></button><button type="button" aria-label="Remove image" onClick={() => { const next = imageList.filter((_, entryIndex) => entryIndex !== index); updateField('images', next); if (content.primaryImage === image.url) updateField('primaryImage', next[0]?.url || '') }}><Trash size={13} /></button></div></article>)}</div><label className="editor-check"><input type="checkbox" checked={Boolean(content.quality.imagesReviewed)} onChange={(event) => updateNested('quality', 'imagesReviewed', event.target.checked)} />I reviewed every image and its public alt text.</label></div>}

          {editorSection === 'Pricing' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">PRICING MANAGER</span><h3>Private costs, considered retail</h3></div><span className="editor-private-note">Supplier costs are never sent to the storefront</span></div><div className="editor-form-grid"><TextField label="CJ supplier cost (USD)" type="number" step="0.01" value={content.pricing.supplierCost} onChange={(value) => updateNested('pricing', 'supplierCost', value)} readOnly /><TextField label="Estimated shipping cost" type="number" step="0.01" value={content.pricing.shippingCost} onChange={(value) => updateNested('pricing', 'shippingCost', value)} /><TextField label="Additional landed costs" type="number" step="0.01" value={content.pricing.additionalCost} onChange={(value) => updateNested('pricing', 'additionalCost', value)} /><TextField label="Selling price" type="number" min="0.01" step="0.01" value={content.pricing.sellingPrice} onChange={(value) => updateNested('pricing', 'sellingPrice', value)} /><TextField label="Discounted price (optional)" type="number" min="0.01" step="0.01" value={content.pricing.discountedPrice ?? ''} onChange={(value) => updateNested('pricing', 'discountedPrice', value === '' ? null : value)} /><TextField label="Currency" value={content.pricing.currency || 'USD'} onChange={(value) => updateNested('pricing', 'currency', value.toUpperCase())} /></div><div className="editor-profit-grid"><div><span>Total landed cost</span><strong>{formatCurrency(totalLandedCost)}</strong></div><div><span>Estimated gross profit</span><strong>{formatCurrency(grossProfit)}</strong></div><div><span>Gross margin</span><strong>{grossMargin.toFixed(1)}%</strong></div></div></div>}

          {editorSection === 'Specifications' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">PRODUCT DETAILS</span><h3>Verified specifications</h3></div><span className="editor-private-note">Only add details confirmed by the supplier</span></div><div className="editor-spec-list">{specs.map(([key, value], index) => <div className="editor-spec-row" key={`${key}-${index}`}><TextField label="Specification" value={key} onChange={(nextKey) => { const next = { ...content.specifications }; delete next[key]; next[nextKey] = value; updateField('specifications', next) }} /><TextField label="Verified value" value={value} onChange={(nextValue) => updateField('specifications', { ...content.specifications, [key]: nextValue })} /><button type="button" aria-label={`Remove ${key}`} onClick={() => { const next = { ...content.specifications }; delete next[key]; updateField('specifications', next) }}><X size={15} /></button></div>)}</div><button type="button" className="editor-secondary-button" onClick={() => updateField('specifications', { ...content.specifications, '': '' })}><Plus size={14} />Add specification</button><label className="editor-check"><input type="checkbox" checked={Boolean(content.quality.specificationsReviewed)} onChange={(event) => updateNested('quality', 'specificationsReviewed', event.target.checked)} />I reviewed the specifications and left unverified details blank.</label></div>}

          {editorSection === 'Variants' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">VARIANT MANAGEMENT</span><h3>Supplier-mapped options</h3></div><span className="editor-private-note">Supplier variant IDs and SKUs stay private</span></div>{variants.length ? <div className="editor-variant-list">{variants.map((variant, index) => <div className="editor-variant-row" key={variant.cjVariantId || index}><TextField label="Variant name" value={variant.name} onChange={(value) => setVariant(index, 'name', value)} /><TextField label="Colour" value={variant.color} onChange={(value) => setVariant(index, 'color', value)} /><TextField label="Size" value={variant.size} onChange={(value) => setVariant(index, 'size', value)} /><TextField label="SKU (private)" value={variant.sku} readOnly onChange={() => {}} /><TextField label="Price" type="number" min="0" step="0.01" value={variant.price} onChange={(value) => setVariant(index, 'price', value)} /><span className="editor-variant-stock">Supplier stock<strong>{variant.stock ?? 0}</strong></span></div>)}</div> : <p className="editor-empty-note">CJ did not return variants for this product. Confirm that there are no variant options before checking this section.</p>}<label className="editor-check"><input type="checkbox" checked={Boolean(content.quality.variantsReviewed)} onChange={(event) => updateNested('quality', 'variantsReviewed', event.target.checked)} />I checked supplier variant and SKU mappings.</label></div>}

          {editorSection === 'Reviews & promotions' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">CUSTOMER TRUST</span><h3>Reviews and promotions</h3></div></div><div className="editor-honesty-note"><WarningCircle size={17} /><div><strong>No review or coupon system is connected in this project.</strong><p>Only reviews with a legitimate source and accurate verification status may be shown. No testimonials have been created or imported. Product-level coupons and checkout promotion rules require a separate integration with the existing cart and payment flow.</p></div></div></div>}

          {editorSection === 'SEO' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">SEARCH PRESENTATION</span><h3>SEO editor</h3></div></div><div className="editor-form-grid"><TextField label="SEO page title" maxLength={70} value={content.seo.title} onChange={(value) => updateNested('seo', 'title', value)} /><TextField label="URL slug" value={content.seo.slug} onChange={(value) => updateNested('seo', 'slug', value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''))} /><TextAreaField className="wide" label="Meta description" rows={3} maxLength={160} value={content.seo.description} onChange={(value) => updateNested('seo', 'description', value)} /><TextField label="Keywords (comma separated)" value={(content.seo.keywords || []).join(', ')} onChange={(value) => updateNested('seo', 'keywords', value.split(',').map((word) => word.trim()).filter(Boolean))} /></div><div className="editor-google-preview"><small>Google search preview · example</small><strong>{content.seo.title || content.title || 'Product title'} · Morrow House</strong><span>morrowhouse.com/product/{content.seo.slug || selectedProduct.id}</span><p>{content.seo.description || content.shortDescription || 'Add a concise, accurate meta description for this product.'}</p></div></div>}

          {editorSection === 'Preview' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">STOREFRONT PREVIEW</span><h3>Customer-facing product page</h3></div><span className="editor-private-note">Private preview · not published</span></div><div className="editor-preview"><div>{activeImage && <img src={imageUrl(activeImage, 900)} alt={imageList.find((image) => image.url === activeImage)?.alt || content.title} />}<div className="editor-preview-thumbs">{imageList.map((image, index) => <img key={`${image.url}-${index}`} src={imageUrl(image.url, 200)} alt={image.alt || ''} />)}</div></div><div><span>{content.category} · MORROW HOUSE</span><h2>{content.title || 'Product title'}</h2><strong>{formatCurrency(Number(content.pricing.discountedPrice || content.pricing.sellingPrice || 0))}</strong><p>{content.description || content.shortDescription || 'Your product description will appear here.'}</p>{variants.length > 0 && <ul>{variants.map((variant, index) => <li key={`${variant.cjVariantId}-${index}`}>{variant.name} · {variant.stock ?? 0} available</li>)}</ul>}</div></div><label className="editor-check"><input type="checkbox" checked={Boolean(content.quality.previewReviewed)} onChange={(event) => updateNested('quality', 'previewReviewed', event.target.checked)} />I inspected this storefront preview.</label></div>}

          {editorSection === 'History' && <div className="editor-card"><div className="editor-card-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h3>Product change history</h3></div><ClockCounterClockwise size={18} /></div>{historyLoading ? <p className="editor-empty-note">Loading product history…</p> : history.length ? <div className="editor-history-list">{history.map((entry) => <article key={entry.id}><div><strong>{entry.action.replaceAll('_', ' ')}</strong><span>{entry.actor} · {new Date(entry.created_at).toLocaleString()}</span></div>{entry.after_data?.editor_content && <button type="button" className="editor-secondary-button" disabled={Boolean(action)} onClick={() => perform('restore', async () => { await onRestoreHistory(selectedProduct.id, entry.id); setSelectedId('') })}><ClockCounterClockwise size={13} />Restore this version</button>}</article>)}</div> : <p className="editor-empty-note">No product changes have been recorded yet.</p>}</div>}

          <div className="editor-footer-actions"><button type="button" className="editor-secondary-button" onClick={saveDraft} disabled={saving || Boolean(action)}><FloppyDisk size={14} />Save draft</button><button type="button" className="editor-secondary-button" onClick={() => perform('refresh', () => onRefreshSupplier(selectedProduct.id))} disabled={Boolean(action)}>Refresh CJ source</button><button type="button" className="editor-secondary-button" onClick={() => perform('sync', () => onSyncStock(selectedProduct.id))} disabled={Boolean(action)}>Sync supplier stock</button>{selectedProduct.editorStatus === 'PUBLISHED' && <button type="button" className="editor-danger-button" onClick={() => changeStatus('EDITING')} disabled={Boolean(action)}>Unpublish</button>}{!['QUEUED', 'ARCHIVED', 'REJECTED'].includes(selectedProduct.editorStatus) && <button type="button" className="editor-secondary-button" onClick={() => changeStatus('QUEUED')} disabled={Boolean(action)}>Return to queue</button>}{!['ARCHIVED', 'REJECTED'].includes(selectedProduct.editorStatus) && <button type="button" className="editor-danger-button" onClick={() => changeStatus('REJECTED')} disabled={Boolean(action)}>Reject</button>}{selectedProduct.editorStatus !== 'ARCHIVED' && <button type="button" className="editor-danger-button" onClick={() => changeStatus('ARCHIVED')} disabled={Boolean(action)}><Archive size={14} />Archive</button>}{selectedProduct.editorStatus === 'ARCHIVED' && <button type="button" className="editor-secondary-button" onClick={() => changeStatus('QUEUED')} disabled={Boolean(action)}>Restore to queue</button>}{selectedProduct.editorStatus === 'REJECTED' && <button type="button" className="editor-secondary-button" onClick={() => changeStatus('QUEUED')} disabled={Boolean(action)}>Return rejected product to queue</button>}</div>
        </div>
      </section>
    )
  }

  return (
    <section className="product-editor">
      <div className="editor-overview">
        {[
          ['Total imported', products.length],
          ['Awaiting editing', statusCounts.QUEUED || 0],
          ['Currently editing', statusCounts.EDITING || 0],
          ['Ready to publish', statusCounts.READY_TO_PUBLISH || 0],
          ['Published', statusCounts.PUBLISHED || 0],
          ['Archived', statusCounts.ARCHIVED || 0],
        ].map(([label, count]) => <article key={label}><span>{label}</span><strong>{count}</strong></article>)}
      </div>
      <section className="editor-card editor-import-card">
        <div className="editor-card-heading"><div><span className="eyebrow">CJ DROPSHIPPING</span><h3>Import to the private preparation queue</h3></div><Package size={18} /></div>
        <form className="editor-search-form" onSubmit={searchCJ}><label className="editor-field"><span>Find products on CJ</span><div><MagnifyingGlass size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search supplier catalog" /></div></label><button className="editor-primary-button" type="submit" disabled={searching || !query.trim()}>{searching ? <CircleNotch className="spin" size={14} /> : <MagnifyingGlass size={14} />}Search CJ</button></form>
        {searchError && <p className="editor-notice is-error" role="alert"><WarningCircle size={15} />{searchError}</p>}
        {results.length > 0 && <div className="editor-search-results">{results.map((product) => <article key={product.id}>{product.image ? <img src={imageUrl(product.image, 180)} alt="" /> : <span className="editor-search-placeholder"><Image size={18} /></span>}<div><strong>{product.name}</strong><span>{product.sku || product.id}</span><small>{product.category} · supplier price {formatCurrency(product.price || 0)}</small></div><button type="button" className="editor-secondary-button" disabled={Boolean(importingId) || products.some((item) => item.id === product.id)} onClick={async () => { setImportingId(product.id); setLocalError(''); try { await onImport(product.id); setNotice('Product imported to Queue Products. It is not published.'); } catch (importError) { setLocalError(importError.message || 'CJ product import failed.'); } finally { setImportingId('') } }}>{importingId === product.id ? <CircleNotch className="spin" size={14} /> : <Plus size={14} />}{products.some((item) => item.id === product.id) ? 'Imported' : 'Import'}</button></article>)}</div>}
      </section>
      {(notice || localError || error) && <div className={`editor-notice ${localError || error ? 'is-error' : ''}`} role={localError || error ? 'alert' : 'status'}>{localError || error ? <WarningCircle size={15} /> : <Check size={15} />}{localError || error || notice}</div>}
      <section className="editor-card">
        <div className="editor-card-heading">
          <div><span className="eyebrow">MERCHANDISING WORKSPACE</span><h3>Product workflow</h3></div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="editor-category-filter"
              aria-label="Filter by category"
            >
              <option value="ALL">All Categories</option>
              {OFFICIAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <label className="editor-list-search"><MagnifyingGlass size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter products" /></label>
          </div>
        </div>
        <nav className="editor-status-tabs" aria-label="Filter products by workflow status">{statusTabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}{tab.id !== 'OVERVIEW' && tab.id !== 'ALL' && <span>{statusCounts[tab.id] || 0}</span>}</button>)}</nav>
        <div className="editor-product-list">{filteredProducts.length ? filteredProducts.map((product) => {
          const itemContent = product.editorContent && Object.keys(product.editorContent).length ? product.editorContent : emptyContent(product)
          const productReadiness = getReadiness(itemContent, product)
          const image = itemContent.primaryImage || product.image
          return <article key={product.id} className="editor-product-row"><div className="editor-product-thumb">{image && <img src={imageUrl(image, 120)} alt="" />}</div><div className="editor-product-main"><strong>{itemContent.title || product.name}</strong><span>{product.id} · {product.supplierSku || 'No supplier SKU'}</span><small>{product.editorStatus === 'PUBLISHED' ? `Published ${product.publishedAt ? new Date(product.publishedAt).toLocaleDateString() : ''}` : `${productReadiness.percentage}% ready`}</small></div><div className="editor-product-meta"><span className={`editor-status status-${product.editorStatus.toLowerCase()}`}>{product.editorStatus.replaceAll('_', ' ')}</span><strong>{formatCurrency(Number(itemContent.pricing?.sellingPrice || 0))}</strong><small>Supplier stock · {product.stock}</small></div><button type="button" className="editor-secondary-button" onClick={() => setSelectedId(product.id)}>{product.editorStatus === 'PUBLISHED' ? <Eye size={14} /> : <ArrowRight size={14} />}{product.editorStatus === 'PUBLISHED' ? 'Review' : 'Edit product'}</button></article>
        }) : <div className="table-empty">No products in this view yet.</div>}</div>
      </section>
    </section>
  )
}

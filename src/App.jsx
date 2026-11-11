import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react'
import { ArrowRight, CheckCircle, CircleNotch, Heart, List, LockKey, MagnifyingGlass, Minus, PaperPlaneRight, Plus, ShoppingBag, Sparkle, Trash, WarningCircle, X } from '@phosphor-icons/react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import countryToCurrency from 'country-to-currency'
import RibbonGlow from './components/RibbonGlow.jsx'
import { PaystackLogo, PayPalLogo } from './components/PaymentLogos.jsx'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'
import './App.css'

const revealItem = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.62, ease: [0.22, 1, 0.36, 1] } },
}

const revealGroup = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.04 } },
}

const categories = [
  { name: 'Organization & Storage', label: 'Everything in its place', image: 'photo-1584622650111-993a426fbf0a' },
  { name: 'Bedroom & Comfort', label: 'A softer place to land', image: 'photo-1600210492486-724fe5c67fb0' },
  { name: 'Home Décor', label: 'The little things, considered', image: 'photo-1490312278390-ab64016e0aa9' },
  { name: 'Lighting', label: 'Set a different mood', image: 'photo-1507473885765-e6ed057f782c' },
  { name: 'Everyday Solutions', label: 'Quiet daily rituals', image: 'photo-1544816155-12df9643f363' },
]

function getCategorySlug(categoryName) {
  if (!categoryName || categoryName === 'Everything') return 'everything'
  return categoryName
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getCategoryFromSlug(slug) {
  if (!slug || slug === 'everything' || slug === 'all') return 'Everything'
  const clean = slug.toLowerCase().trim()
  const matched = categories.find((c) => getCategorySlug(c.name) === clean)
  if (matched) return matched.name
  const decoded = decodeURIComponent(clean)
  const direct = categories.find((c) => c.name.toLowerCase() === decoded)
  return direct ? direct.name : 'Everything'
}

const heroSlides = [
  { image: 'photo-1600210492486-724fe5c67fb0', alt: 'A sunlit living room layered with natural textures', note: 'THE ART OF STAYING IN', label: 'STAY IN' },
  { image: 'photo-1600607687939-ce8a6c25118c', alt: 'A calm, light-filled home with thoughtful furniture', note: 'ROOM TO SLOW DOWN', label: 'SLOW DOWN' },
  { image: 'photo-1600210491892-03d54c0aaf87', alt: 'A warm, collected living space made for gathering', note: 'MADE FOR GATHERING', label: 'GATHER' },
]

const currencyOptions = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'EUR', name: 'Euro' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'GHS', name: 'Ghanaian Cedi' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'INR', name: 'Indian Rupee' },
]

const manualCurrencyStorageKey = 'morrow-house-display-currency'
const detectedCurrencyStorageKey = 'morrow-house-detected-currency'
const CurrencyContext = createContext({ currency: 'USD', exchangeRate: 1, rates: { USD: 1 }, currencyReady: false, onCurrencyChange: () => {} })

function useCurrency() {
  return useContext(CurrencyContext)
}

function CurrencySelector() {
  const { currency, rates, currencyReady, onCurrencyChange } = useCurrency()
  const options = currencyOptions.filter(({ code }) => Number.isFinite(rates[code]))
  if (currency !== 'USD' && !options.some(({ code }) => code === currency) && Number.isFinite(rates[currency])) {
    options.push({ code: currency, name: currency })
  }

  return (
    <label className="currency-selector">
      <span className="sr-only">Display currency</span>
      <select aria-label="Display currency" value={currency} disabled={!currencyReady} onChange={(event) => onCurrencyChange(event.target.value)}>
        {options.map(({ code }) => <option key={code} value={code}>{code}</option>)}
      </select>
      <span className="currency-charge-note">Checkout in USD</span>
    </label>
  )
}

const imageUrl = (photo, width = 1000) => {
  if (typeof photo !== 'string' || !photo) return ''
  if (/^https?:\/\//i.test(photo)) return photo
  return `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=${width}&q=85`
}

const formatPrice = (price, currency = 'USD', exchangeRate = 1) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price * exchangeRate)

function getRoutePath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

function getSavedCart() {
  try {
    const savedCart = JSON.parse(window.localStorage.getItem('morrow-house-cart') || '{}')
    return savedCart && typeof savedCart === 'object' && !Array.isArray(savedCart) ? savedCart : {}
  } catch {
    return {}
  }
}

function getCartKey(productId, variantId = '') {
  return variantId ? `${productId}::variant:${variantId}` : String(productId)
}

function getCartLineKeyParts(cartKey) {
  const marker = '::variant:'
  const markerIndex = cartKey.lastIndexOf(marker)
  return markerIndex < 0
    ? { productId: cartKey, variantId: '' }
    : { productId: cartKey.slice(0, markerIndex), variantId: cartKey.slice(markerIndex + marker.length) }
}

function getSavedCurrency() {
  try {
    return window.localStorage.getItem(manualCurrencyStorageKey) || 'USD'
  } catch {
    return 'USD'
  }
}

const designQuestions = [
  'Help me make a small living room feel finished',
  'What would make a thoughtful housewarming gift?',
  'How can I make my evenings feel cozier?',
]

const DESIGN_ENTHUSIAST_STORAGE_KEY = 'morrow-house-design-enthusiast-messages'

function DesignEnthusiast() {
  const reduceMotion = useReducedMotion()
  const [messages, setMessages] = useState(() => {
    try {
      const savedMessages = window.localStorage.getItem(DESIGN_ENTHUSIAST_STORAGE_KEY)
      return savedMessages ? JSON.parse(savedMessages) : []
    } catch (error) {
      console.warn('Failed to load design enthusiast messages:', error)
      return []
    }
  })
  const [question, setQuestion] = useState('')
  const [assistantMode, setAssistantMode] = useState('guide')
  const [isAnswering, setIsAnswering] = useState(false)
  const messageEndRef = useRef(null)
  const previousMessageCount = useRef(messages.length)

  useEffect(() => {
    let active = true
    fetch('/api/health')
      .then((response) => response.json())
      .then((health) => {
        if (active) setAssistantMode(health.designAssistantConfigured ? 'ai' : 'guide')
      })
      .catch(() => {
        if (active) setAssistantMode('guide')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const hasNewMessages = messages.length > previousMessageCount.current
    previousMessageCount.current = messages.length
    if (!hasNewMessages && !isAnswering) return
    messageEndRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' })
  }, [messages, isAnswering, reduceMotion])

  useEffect(() => {
    if (!messages.length) return
    try {
      window.localStorage.setItem(DESIGN_ENTHUSIAST_STORAGE_KEY, JSON.stringify(messages))
    } catch (error) {
      console.warn('Failed to save design enthusiast messages:', error)
    }
  }, [messages])

  async function askDesignEnthusiast(value = question) {
    const prompt = value.trim()
    if (!prompt || isAnswering) return

    setMessages((current) => [...current, { id: `${Date.now()}-customer`, role: 'customer', content: prompt }])
    setQuestion('')
    setIsAnswering(true)

    try {
      const response = await fetch('/api/design-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
        signal: AbortSignal.timeout(20_000),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The design desk is taking a little breather. Try again in a moment.')
      setAssistantMode(result.mode || 'guide')
      setMessages((current) => [...current, { id: `${Date.now()}-assistant`, role: 'assistant', content: result.answer }])
    } catch (error) {
      setMessages((current) => [...current, {
        id: `${Date.now()}-assistant-error`,
        role: 'assistant',
        content: error instanceof Error ? error.message : 'The design desk is taking a little breather. Try again in a moment.',
      }])
    } finally {
      setIsAnswering(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    askDesignEnthusiast()
  }

  return (
    <motion.section className="design-enthusiast" id="design-enthusiast" aria-labelledby="design-enthusiast-title" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.12 }} variants={reduceMotion ? undefined : revealGroup}>
      <div className="section-wrap design-enthusiast-layout">
        <motion.div className="design-enthusiast-intro" variants={reduceMotion ? undefined : revealItem}>
          <span className="overline"><Sparkle size={13} weight="fill" /> THE MORROW HOUSE DESIGN DESK</span>
          <h2 id="design-enthusiast-title">Meet your<br /><em>design enthusiast.</em></h2>
          <p>Small-room dilemmas, softer evenings, the gift they’ll actually keep. Let’s find a thoughtful answer together.</p>
          <div className="design-note"><span className="design-note-mark"><Sparkle size={16} /></span><span>Collection-aware suggestions, always grounded in what we actually know.</span></div>
        </motion.div>

        <motion.div className="assistant-panel" variants={reduceMotion ? undefined : revealItem}>
          <div className="assistant-panel-header">
            <div className="assistant-avatar"><Sparkle size={18} weight="fill" /></div>
            <div className="assistant-identity"><strong>The Design Enthusiast</strong><span>Morrow House · here for the details</span></div>
            <span className={`assistant-mode ${assistantMode === 'ai' ? 'is-live' : ''}`}><span />{assistantMode === 'ai' ? 'LIVE AI' : assistantMode === 'checking' ? 'CONNECTING' : 'DESIGN GUIDE'}</span>
          </div>

          <div className="assistant-conversation" role="log" aria-label="Conversation with the Design Enthusiast" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 ? (
              <div className="assistant-welcome">
                <span className="assistant-welcome-label">A NOTE FROM THE DESIGN DESK</span>
                <p>Tell me about your room, your mood, or the person you’re shopping for. I’ll start with pieces I know.</p>
              </div>
            ) : messages.map((message) => (
              <motion.div className={`assistant-message ${message.role === 'customer' ? 'from-customer' : 'from-assistant'}`} key={message.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                {message.role === 'assistant' && <span className="assistant-message-label">THE DESIGN ENTHUSIAST</span>}
                <p>{message.content}</p>
              </motion.div>
            ))}
            {isAnswering && <div className="assistant-thinking" role="status"><span /><span /><span /><span className="sr-only">The Design Enthusiast is thinking</span></div>}
            <div ref={messageEndRef} />
          </div>

          <div className="assistant-suggestions" aria-label="Common questions">
            {designQuestions.map((suggestion) => (
              <button type="button" key={suggestion} disabled={isAnswering} onClick={() => askDesignEnthusiast(suggestion)}>{suggestion}<ArrowRight size={13} /></button>
            ))}
            <button type="button" onClick={() => {
              setMessages([])
              window.localStorage.removeItem(DESIGN_ENTHUSIAST_STORAGE_KEY)
            }} className="clear-chat-button">
              Clear Conversation<X size={13} />
            </button>
          </div>

          <form className="assistant-composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="design-question">Ask the Design Enthusiast</label>
            <textarea id="design-question" rows="1" maxLength="600" placeholder="Ask about a room, a piece, or a good gift…" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSubmit(event) } }} />
            <button type="submit" aria-label="Send your question" disabled={!question.trim() || isAnswering}><PaperPlaneRight size={18} weight="fill" /></button>
          </form>
          <p className="assistant-disclosure">{assistantMode === 'ai' ? 'Live AI sends your question to OpenAI to generate a reply. Please don’t share personal details.' : 'Catalog-guide answers use listed products and delivery details only. Anything unknown will be called out.'}</p>
        </motion.div>
      </div>
    </motion.section>
  )
}

function CartPage({ cartProducts, cartCount, subtotal, changeQuantity, onNavigate }) {
  const reduceMotion = useReducedMotion()
  const { currency, exchangeRate } = useCurrency()
  const checkoutNotice = new URLSearchParams(window.location.search).get('payment') === 'cancelled'
    ? 'Payment was canceled. Your bag is saved whenever you are ready.'
    : ''
  const shippingThreshold = 150
  const shippingRemaining = Math.max(0, shippingThreshold - subtotal)
  const shippingProgress = Math.min(100, (subtotal / shippingThreshold) * 100)

  return (
    <motion.section className="cart-page section-wrap" aria-labelledby="cart-page-title" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <nav className="cart-breadcrumb" aria-label="Breadcrumb">
        <a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Your bag</span>
      </nav>

      <div className="cart-page-heading">
        <div className="cart-glow"><RibbonGlow style={{ width: '100%', height: '100%' }} speed={0.65} hover={0.55} /></div>
        <div>
          <span className="overline">GOOD CHOICES, ALREADY</span>
          <h1 id="cart-page-title">Your bag<span>.</span></h1>
        </div>
        <span className="cart-page-count">{cartCount} {cartCount === 1 ? 'piece' : 'pieces'}</span>
      </div>

      {cartProducts.length ? (
        <div className="cart-page-layout">
          <section className="cart-page-items" aria-label="Items in your bag">
            <div className="cart-items-heading"><span>Item</span><span>Total</span></div>
            <AnimatePresence initial={false}>
              {cartProducts.map((product) => (
                <motion.article className="cart-page-item" key={product.cartKey} layout initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.24 }}>
                  <img src={imageUrl(product.image, 360)} alt={`${product.name}`} />
                  <div className="cart-page-item-info">
                    <span className="cart-item-category">{product.category}</span>
                    <h2>{product.name}</h2>
                    {product.variant && <p className="cart-item-variant">{product.variant.name}</p>}
                    <p>{product.variant ? `${product.variant.name} · ` : ''}{product.detail}</p>
                    <div className="cart-page-item-controls">
                      <div className="quantity-control" aria-label={`Quantity for ${product.name}`}>
                        <button type="button" onClick={() => changeQuantity(product.cartKey, -1)} aria-label={`Remove one ${product.name}`}><Minus size={13} /></button>
                        <span>{product.quantity}</span>
                        <button type="button" onClick={() => changeQuantity(product.cartKey, 1)} aria-label={`Add one ${product.name}`}><Plus size={13} /></button>
                      </div>
                      <button type="button" className="remove-item" onClick={() => changeQuantity(product.cartKey, -product.quantity)} aria-label={`Remove ${product.name} from bag`}><Trash size={15} /><span>Remove</span></button>
                    </div>
                  </div>
                  <strong className="cart-page-item-total">{formatPrice(product.price * product.quantity, currency, exchangeRate)}</strong>
                </motion.article>
              ))}
            </AnimatePresence>
            <a className="continue-shopping" href="/" onClick={(event) => onNavigate(event, '/')}> <ArrowRight size={15} /> Keep looking around</a>
          </section>

          <aside className="order-summary" aria-labelledby="order-summary-title">
            <span className="overline">THE IMPORTANT DETAILS</span>
            <h2 id="order-summary-title">Order summary</h2>
            <div className="shipping-unlock">
              <div className="shipping-track" role="progressbar" aria-label="Progress toward complimentary shipping" aria-valuemin="0" aria-valuemax={shippingThreshold * exchangeRate} aria-valuenow={Math.min(subtotal, shippingThreshold) * exchangeRate}>
                <span style={{ width: `${shippingProgress}%` }} />
              </div>
              <p>{shippingRemaining ? `You're ${formatPrice(shippingRemaining, currency, exchangeRate)} away from complimentary shipping.` : 'Complimentary shipping is yours.'}</p>
            </div>
            <div className="summary-line"><span>Items · {cartCount} {cartCount === 1 ? 'piece' : 'pieces'}</span><strong>{formatPrice(subtotal, currency, exchangeRate)}</strong></div>
            <div className="summary-line summary-muted"><span>Shipping</span><span>Calculated at checkout</span></div>
            <div className="summary-total"><span>Subtotal</span><strong>{formatPrice(subtotal, currency, exchangeRate)}</strong></div>
            <p className="summary-footnote">Complimentary shipping over $150. Payment is safely processed with Paystack.</p>
            <a className="checkout-button" href="/checkout" onClick={(event) => onNavigate(event, '/checkout')}>Review order <ArrowRight size={17} /></a>
            <div className="checkout-security"><LockKey size={14} /><span>Secure checkout powered by Paystack</span></div>
            {checkoutNotice && <p className="checkout-notice" role="status" aria-live="polite">{checkoutNotice}</p>}
            <div className="summary-assurance"><span>30 days to make yourself at home</span><span>Thoughtfully packed, always</span></div>
          </aside>
        </div>
      ) : (
        <div className="cart-empty-state">
          <div className="empty-bag-mark"><ShoppingBag size={25} /></div>
          <h2>Nothing in here. Yet.</h2>
          <p>The best rooms start with one good find.</p>
          <a className="hero-cta" href="/" onClick={(event) => onNavigate(event, '/')}>Find your first favorite <ArrowRight size={17} /></a>
        </div>
      )}
    </motion.section>
  )
}

function CheckoutSuccess({ status, error, sessionId, onNavigate }) {
  const isPaid = status === 'paid'
  const isChecking = status === 'checking'

  return (
    <motion.section className="payment-return section-wrap" aria-live="polite" aria-labelledby="payment-return-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className={`payment-return-mark ${isPaid ? 'is-paid' : isChecking ? 'is-checking' : 'has-error'}`}>
        {isPaid ? <CheckCircle size={29} /> : isChecking ? <CircleNotch className="checkout-spinner" size={25} /> : <WarningCircle size={29} />}
      </div>
      <span className="overline">{isPaid ? 'PAYMENT CONFIRMED' : isChecking ? 'ONE MOMENT' : 'PAYMENT STATUS'}</span>
      <h1 id="payment-return-title">{isPaid ? <>Good things<br /><em>are on their way.</em></> : isChecking ? 'Confirming your payment.' : 'We couldn’t confirm that payment.'}</h1>
      <p>{isPaid ? 'Paystack has confirmed your payment. Keep your payment reference for your records.' : isChecking ? 'We’re securely verifying your payment with Paystack.' : error || 'Your bag is still saved. Check your payment status before trying again.'}</p>
      <div className="payment-return-actions">
        <a className="hero-cta" href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Back to the shop <ArrowRight size={17} /></a>
        {isPaid && <a className="text-link" href={`/track-order?session_id=${encodeURIComponent(sessionId || '')}`} onClick={(event) => onNavigate(event, `/track-order?session_id=${encodeURIComponent(sessionId || '')}`)}>Track your order <ArrowRight size={15} /></a>}
      </div>
    </motion.section>
  )
}

function ProductTile({ product, index, onNavigate, isFavorite, onToggleFavorite }) {
  const reduceMotion = useReducedMotion()
  const { currency, exchangeRate } = useCurrency()
  const productPath = `/product/${product.id}`

  // Enhanced product card variants with more sophisticated animations
  const enhancedCardVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 20
      }
    }
  }

  function handleCardClick(event) {
    if (event.target.closest('button')) return
    onNavigate(event, productPath)
  }

  return (
    <motion.article
      className="product-card"
      layout
      initial={reduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={reduceMotion ? undefined : enhancedCardVariants}
      transition={{ duration: 0.3 }}
      onClick={handleCardClick}
    >
      <div className="product-image-wrap group">
        <a href={productPath} onClick={(event) => onNavigate(event, productPath)} aria-label={`View ${product.name}`} className="product-image-link">
          <img
            src={imageUrl(product.image, 900)}
            alt={`${product.name} in a thoughtfully styled interior`}
            loading="lazy"
          />
        </a>
        <div className="absolute top-2 right-2 z-10">
          <span className="product-badge">{product.badge}</span>
        </div>
      </div>
      <div className="product-meta pt-4">
        <div className="mb-1">
          <h3 className="text-lg font-medium text-foreground">
            <a href={productPath} onClick={(event) => onNavigate(event, productPath)} className="hover:underline">
              {product.name}
            </a>
          </h3>
        </div>
        <span className="product-price text-lg font-semibold">{formatPrice(product.price, currency, exchangeRate)}</span>
      </div>
    </motion.article>
  )
}

function ProductCollectionShelves({ products, onNavigate, onSelectCategory, favorites, onToggleFavorite }) {
  const collections = categories
    .map((category) => ({
      ...category,
      products: products.filter((product) => product.category === category.name),
    }))
    .filter((collection) => collection.products.length > 0)

  return <div className="product-collection-shelves">
    {collections.map((collection) => <section className="product-collection-shelf" key={collection.name} aria-labelledby={`collection-${collection.name.toLowerCase()}-title`}>
      <div className="product-collection-heading">
        <div><span className="overline">{collection.label}</span><h3 id={`collection-${collection.name.toLowerCase()}-title`}>{collection.name}</h3></div>
        <button type="button" className="text-link" onClick={() => onSelectCategory(collection.name)}>Shop {collection.name} <ArrowRight size={15} /></button>
      </div>
      <div className="product-collection-row">
        {collection.products.map((product, index) => <ProductTile key={product.id} product={product} index={index} onNavigate={onNavigate} isFavorite={favorites?.includes(product.id)} onToggleFavorite={onToggleFavorite} />)}
      </div>
    </section>)}
  </div>
}

function AddToBagButton({ product, variantId, className, onAdd, disabled = false }) {
  const reduceMotion = useReducedMotion()
  const [added, setAdded] = useState(false)

  function handleAdd() {
    onAdd(product.id, variantId)
    setAdded(true)
  }

  return (
    <motion.button
      type="button"
      className={`${className}${added ? ' is-added' : ''}`}
      onClick={handleAdd}
      disabled={disabled}
      aria-label={added ? `${product.name} added to bag` : `Add ${product.name} to bag`}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {added ? (
          <motion.span
            key="added"
            className="add-to-bag-success"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.55, rotate: -18 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.65 }}
            transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 480, damping: 25 }}
          >
            <CheckCircle size={21} weight="fill" aria-hidden="true" />
            <span>Added to bag</span>
          </motion.span>
        ) : (
          <motion.span
            key="label"
            className="add-to-bag-label"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.16 }}
          >
            Add to bag
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function ShopPage({ products, activeCategory, onSelectCategory, subFilter = 'all', onSelectSubFilter, searchTerm, setSearchTerm, onNavigate }) {
  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === 'Everything' || product.category === activeCategory
    const matchesSearch = `${product.name} ${product.detail} ${product.category} ${product.searchTerms}`.toLowerCase().includes(searchTerm.trim().toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Filter/sort products based on subFilter
  const filteredProducts = useMemo(() => {
    if (!visibleProducts.length) return visibleProducts

    switch (subFilter) {
      case 'trending':
        return visibleProducts.filter(product => product.is_trending || product.public_data?.isTrending || product.badge?.toLowerCase().includes('trending'))
      case 'new-arrivals':
        return [...visibleProducts].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
      case 'under-200':
        return visibleProducts.filter(product => product.price < 200)
      case 'best-sellers':
        return [...visibleProducts].sort((a, b) => a.name.localeCompare(b.name))
      case 'all':
      default:
        return visibleProducts
    }
  }, [visibleProducts, subFilter])

  const subFilters = [
    { id: 'all', label: 'All' },
    { id: 'trending', label: 'Trending Now' },
    { id: 'new-arrivals', label: 'New Arrivals' },
    { id: 'under-200', label: 'Under $200' },
    { id: 'best-sellers', label: 'Best Sellers' },
  ]

  return (
    <motion.section className="shop-page section-wrap" aria-labelledby="shop-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <nav className="cart-breadcrumb" aria-label="Breadcrumb"><a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a><span aria-hidden="true">/</span><span aria-current="page">Shop</span></nav>
      <div className="editorial-page-heading"><span className="overline">A ROOM OF YOUR OWN</span><h1 id="shop-title">Good things<br /><em>for living in.</em></h1><p>Considered pieces for slower mornings, softer evenings, and the spaces in between.</p></div>
      <div className="shop-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filter products by category">
          {['Everything', ...categories.map((category) => category.name)].map((category) => (
            <button
              className={activeCategory === category ? 'filter-tab active' : 'filter-tab'}
              type="button"
              aria-pressed={activeCategory === category}
              key={category}
              onClick={() => onSelectCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <span className="product-count">{filteredProducts.length} considered favorites</span>
      </div>

      {visibleProducts.length > 0 && (
        <div className="filter-tabs" style={{ marginTop: '1rem' }} role="group" aria-label="Sort and filter products">
          {subFilters.map((filter) => (
            <button
              key={filter.id}
              className={subFilter === filter.id ? 'filter-tab active' : 'filter-tab'}
              type="button"
              aria-pressed={subFilter === filter.id}
              onClick={() => onSelectSubFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}

      {visibleProducts.length ? (
        activeCategory === 'Everything' && subFilter === 'all'
          ? <ProductCollectionShelves products={visibleProducts} onNavigate={onNavigate} onSelectCategory={onSelectCategory} />
          : <div className="product-grid shop-product-grid">{filteredProducts.map((product, index) => <ProductTile key={product.id} product={product} index={index} onNavigate={onNavigate} />)}</div>
      ) : (
        <div className="empty-results">
          <p>No pieces found for “{searchTerm}”.</p>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setSearchTerm('')
              onSelectCategory('Everything')
              onSelectSubFilter('all')
            }}
          >
            Clear filters <ArrowRight size={15} />
          </button>
        </div>
      )}
    </motion.section>
  )
}

function ProductPage({ product, products, onNavigate, onAdd }) {
  const reduceMotion = useReducedMotion()
  const { currency, exchangeRate } = useCurrency()
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [selectedImage, setSelectedImage] = useState('')
  useEffect(() => {
    setSelectedVariantId(product?.variants?.[0]?.id || '')
    setSelectedImage(product?.image || '')
  }, [product?.id])
  if (!product) return <NotFoundPage onNavigate={onNavigate} />
  const relatedProducts = products.filter((item) => item.id !== product.id)
  const variants = Array.isArray(product.variants) ? product.variants : []
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId)
  const images = Array.isArray(product.images) && product.images.length
    ? product.images
    : [{ url: product.image, alt: `${product.name} styled in a home` }]
  const primaryImage = images.find((image) => image.url === selectedImage) || images[0]
  const displayedPrice = Number(selectedVariant?.price || product.price)
  const isAvailable = selectedVariant ? Number(selectedVariant.stock) > 0 : Number(product.stock ?? 1) > 0

  return (
    <motion.section className="product-page section-wrap" aria-labelledby="product-title" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <nav className="cart-breadcrumb" aria-label="Breadcrumb"><a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a><span aria-hidden="true">/</span><a href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Shop</a><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span></nav>
      <div className="product-detail-layout">
        <div className="product-detail-gallery"><motion.div className="product-detail-image" initial={reduceMotion ? false : { opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55 }}><img src={imageUrl(primaryImage.url, 1400)} alt={primaryImage.alt || `${product.name} styled in a home`} /></motion.div>{images.length > 1 && <div className="product-detail-thumbnails" aria-label="Product images">{images.map((image, index) => <button key={`${image.url}-${index}`} type="button" className={image.url === primaryImage.url ? 'is-active' : ''} onClick={() => setSelectedImage(image.url)} aria-label={`Show product image ${index + 1}`}><img src={imageUrl(image.url, 200)} alt="" /></button>)}</div>}</div>
        <div className="product-detail-copy"><span className="overline">{product.category} · MORROW HOUSE</span><h1 id="product-title">{product.name}</h1><span className="product-detail-price">{formatPrice(displayedPrice, currency, exchangeRate)}</span><p className="product-detail-description">{product.detail}</p>{variants.length > 0 && <label className="product-variant-picker"><span>Choose an option</span><select value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)}>{variants.map((variant) => <option key={variant.id} value={variant.id} disabled={Number(variant.stock) < 1}>{variant.name}{variant.color ? ` · ${variant.color}` : ''}{variant.size ? ` · ${variant.size}` : ''}{Number(variant.stock) < 1 ? ' · Unavailable' : ''}</option>)}</select></label>}<p className="product-detail-badge">{isAvailable ? product.badge : 'Currently unavailable'}</p><AddToBagButton product={product} variantId={selectedVariant?.id} onAdd={onAdd} disabled={!isAvailable} className="checkout-button product-detail-add-button" /><a className="product-detail-cart-link" href="/cart" onClick={(event) => onNavigate(event, '/cart')}>View your bag <ArrowRight size={15} /></a><div className="product-service-notes"><a href="/shipping" onClick={(event) => onNavigate(event, '/shipping')}>Complimentary shipping over $150</a><a href="/refunds" onClick={(event) => onNavigate(event, '/refunds')}>30 days to make yourself at home</a></div>{Object.keys(product.specifications || {}).length > 0 && <dl className="product-specification-list">{Object.entries(product.specifications).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</div>
      </div>
      <section className="related-products" aria-labelledby="related-products-title"><div className="section-intro"><div><span className="overline">A FEW GOOD COMPANIONS</span><h2 id="related-products-title">Make room for more.</h2></div><a className="text-link" href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Shop everything <ArrowRight size={15} /></a></div><div className="product-grid">{relatedProducts.slice(0, 3).map((item, index) => <ProductTile key={item.id} product={item} index={index} onNavigate={onNavigate} />)}</div></section>
    </motion.section>
  )
}

function CheckoutAddressFields({ title, address, onChange, idPrefix }) {
  const field = (name, label, autocomplete, options = {}) => (
    <label className="checkout-field" htmlFor={`${idPrefix}-${name}`}>
      <span>{label}{options.optional ? ' (optional)' : ' *'}</span>
      <input id={`${idPrefix}-${name}`} name={`${idPrefix}-${name}`} autoComplete={autocomplete} value={address[name] || ''} onChange={(event) => onChange(name, event.target.value)} required={!options.optional} maxLength={options.maxLength || 200} />
    </label>
  )

  return (
    <fieldset className="checkout-address-fields">
      <legend>{title}</legend>
      {field('line1', 'Street address', `${idPrefix} address-line1`)}
      {field('line2', 'Apartment / suite', `${idPrefix} address-line2`, { optional: true })}
      {field('city', 'City', `${idPrefix} address-level2`, { maxLength: 100 })}
      {field('region', 'State / province', `${idPrefix} address-level1`, { maxLength: 100 })}
      {field('postalCode', 'ZIP / postal code', `${idPrefix} postal-code`, { maxLength: 24 })}
      <label className="checkout-field" htmlFor={`${idPrefix}-country`}>
        <span>Country / region *</span>
        <select id={`${idPrefix}-country`} name={`${idPrefix}-country`} autoComplete={`${idPrefix} country`} value={address.country} onChange={(event) => onChange('country', event.target.value)} required>
          <option value="US">United States</option>
          <option value="CA">Canada</option>
        </select>
      </label>
    </fieldset>
  )
}

function CheckoutPage({ cartProducts, cartCount, subtotal, onNavigate }) {
  const { currency, exchangeRate } = useCurrency()
  const [paymentGateway, setPaymentGateway] = useState('paystack')
  const [paypalConfig, setPaypalConfig] = useState(null)
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [checkoutNotice, setCheckoutNotice] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponNotice, setCouponNotice] = useState('')
  const [checkoutDetails, setCheckoutDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    shippingMethod: 'ground',
    sameBillingAddress: true,
    shippingAddress: { line1: '', line2: '', city: '', region: '', postalCode: '', country: 'US' },
    billingAddress: { line1: '', line2: '', city: '', region: '', postalCode: '', country: 'US' },
  })

  const shippingUsd = subtotal >= 150 ? 0 : 15
  const finalTotalUsd = subtotal + shippingUsd
  const customerName = `${checkoutDetails.firstName} ${checkoutDetails.lastName}`.trim()
  const deliveryRegionSummary = [checkoutDetails.shippingAddress.city, checkoutDetails.shippingAddress.region, checkoutDetails.shippingAddress.postalCode].filter(Boolean).join(', ')
  const deliveryCountry = checkoutDetails.shippingAddress.country === 'US' ? 'United States' : 'Canada'
  const billingAddressSummary = [
    checkoutDetails.billingAddress.line1,
    checkoutDetails.billingAddress.line2,
    checkoutDetails.billingAddress.city,
    checkoutDetails.billingAddress.region,
    checkoutDetails.billingAddress.postalCode,
    checkoutDetails.billingAddress.country === 'US' ? 'United States' : 'Canada',
  ].filter(Boolean).join(', ')

  useEffect(() => {
    let active = true
    fetch('/api/paypal/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('PayPal configuration could not be loaded.')
        return response.json()
      })
      .then((config) => {
        if (active) setPaypalConfig(config)
      })
      .catch(() => {
        if (active) setPaypalConfig({ enabled: false, clientId: '' })
      })
    return () => { active = false }
  }, [])

  function updateCheckoutField(field, value) {
    setCheckoutDetails((current) => ({ ...current, [field]: value }))
  }

  function updateAddress(group, field, value) {
    setCheckoutDetails((current) => ({ ...current, [group]: { ...current[group], [field]: value } }))
  }

  async function handlePaystackCheckout(event) {
    event.preventDefault()
    if (couponCode.trim()) {
      setCheckoutNotice('There are no active coupon codes right now. Please contact us if you need help with a promotion.')
      return
    }

    setCheckoutPending(true)
    setCheckoutNotice('')

    try {
      const response = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutDetails,
          couponCode,
          items: cartProducts.map((product) => ({ productId: product.id, variantId: product.variantId || undefined, quantity: product.quantity })),
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to initialize Paystack checkout.')
      }

      const win = window
      const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
      const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_live_d2e4bb883f45096a034c3ed24d0ef6565d1a5484'

      if (!isMobile && win.PaystackPop && typeof win.PaystackPop.setup === 'function') {
        try {
          const handler = win.PaystackPop.setup({
            key: paystackPublicKey,
            email: checkoutDetails.email.trim(),
            amount: Math.round(data.amountNgn * 100),
            currency: 'NGN',
            ref: data.reference,
            metadata: {
              orderId: data.orderId,
              customerName,
              customerPhone: checkoutDetails.phone,
              shippingMethod: checkoutDetails.shippingMethod,
              shippingAddress: checkoutDetails.shippingAddress,
              billingAddress: checkoutDetails.sameBillingAddress ? checkoutDetails.shippingAddress : checkoutDetails.billingAddress,
            },
            callback: function (resp) {
              window.location.href = `/checkout/success?session_id=${resp.reference}&paystack=true`
            },
            onClose: function () {
              setCheckoutPending(false)
            },
          })
          handler.openIframe()
          return
        } catch (popupError) {
          console.warn('Paystack popup fallback to redirect:', popupError)
        }
      }

      if (data.authorizationUrl) {
        window.location.assign(data.authorizationUrl)
        return
      }

      throw new Error('Could not open Paystack payment window.')
    } catch (error) {
      setCheckoutNotice(error instanceof Error ? error.message : 'Paystack checkout failed. Please try again.')
      setCheckoutPending(false)
    }
  }

  return (
    <motion.section className="checkout-page section-wrap" aria-labelledby="checkout-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <nav className="cart-breadcrumb" aria-label="Breadcrumb"><a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a><span>/</span><a href="/cart" onClick={(event) => onNavigate(event, '/cart')}>Your bag</a><span>/</span><span aria-current="page">Checkout</span></nav>
      <div className="editorial-page-heading checkout-heading"><span className="overline">A FEW DETAILS, THEN YOU’RE THERE</span><h1 id="checkout-title">Review your<br /><em>good choices.</em></h1><p>Your payment is processed securely with Paystack PCI-DSS encrypted checkout.</p></div>
      {cartProducts.length ? (
        <div className="checkout-layout">
          <section className="checkout-review" aria-label="Order items">
            <h2>Your pieces <span>{cartCount}</span></h2>
            {cartProducts.map((product) => (
              <article className="checkout-review-item" key={product.cartKey}>
                <img src={imageUrl(product.image, 260)} alt="" />
                <div>
                  <strong>{product.name}</strong>
                  {product.variant && <span>{product.variant.name}</span>}
                  <span>{product.detail}</span>
                  <span>Qty {product.quantity}</span>
                </div>
                <b>{formatPrice(product.price * product.quantity, currency, exchangeRate)}</b>
              </article>
            ))}
            <a className="continue-shopping" href="/cart" onClick={(event) => onNavigate(event, '/cart')}>Edit your bag <ArrowRight size={15} /></a>
          </section>

          <aside className="order-summary checkout-summary">
            <span className="overline">THE IMPORTANT DETAILS</span>
            <h2>Order summary</h2>
            <div className="summary-line"><span>Items · {cartCount} {cartCount === 1 ? 'piece' : 'pieces'}</span><strong>{formatPrice(subtotal, currency, exchangeRate)}</strong></div>
            <div className="summary-line summary-muted"><span>Ground shipping</span><span>{shippingUsd === 0 ? 'Complimentary' : formatPrice(shippingUsd, currency, exchangeRate)}</span></div>

            <form className="checkout-form" onSubmit={handlePaystackCheckout}>
              <div className="checkout-section-heading"><span className="overline">YOUR DETAILS</span><h3>Contact</h3></div>
              <div className="checkout-form-grid">
                <label className="checkout-field" htmlFor="checkout-first-name"><span>First name *</span><input id="checkout-first-name" name="given-name" autoComplete="given-name" value={checkoutDetails.firstName} onChange={(event) => updateCheckoutField('firstName', event.target.value)} maxLength={100} required /></label>
                <label className="checkout-field" htmlFor="checkout-last-name"><span>Last name *</span><input id="checkout-last-name" name="family-name" autoComplete="family-name" value={checkoutDetails.lastName} onChange={(event) => updateCheckoutField('lastName', event.target.value)} maxLength={100} required /></label>
                <label className="checkout-field checkout-field-wide" htmlFor="checkout-email"><span>Email address *</span><input id="checkout-email" type="email" name="email" autoComplete="email" value={checkoutDetails.email} onChange={(event) => updateCheckoutField('email', event.target.value)} maxLength={254} required /></label>
                <label className="checkout-field checkout-field-wide" htmlFor="checkout-phone"><span>Phone number *</span><input id="checkout-phone" type="tel" name="tel" autoComplete="tel" value={checkoutDetails.phone} onChange={(event) => updateCheckoutField('phone', event.target.value)} maxLength={30} required /></label>
              </div>

              <CheckoutAddressFields title="Delivery / shipping address" idPrefix="shipping" address={checkoutDetails.shippingAddress} onChange={(field, value) => updateAddress('shippingAddress', field, value)} />

              <fieldset className="checkout-shipping-method">
                <legend>Shipping method</legend>
                <label><input type="radio" name="shipping-method" value="ground" checked={checkoutDetails.shippingMethod === 'ground'} onChange={(event) => updateCheckoutField('shippingMethod', event.target.value)} required /><span><strong>Ground shipping</strong><small>United States and Canada · {shippingUsd === 0 ? 'Complimentary' : `${formatPrice(shippingUsd, currency, exchangeRate)} · Free over $150`}</small></span></label>
              </fieldset>

              <label className="checkout-same-address"><input type="checkbox" checked={checkoutDetails.sameBillingAddress} onChange={(event) => updateCheckoutField('sameBillingAddress', event.target.checked)} /><span>Billing address is the same as delivery</span></label>
              {!checkoutDetails.sameBillingAddress && <CheckoutAddressFields title="Billing address" idPrefix="billing" address={checkoutDetails.billingAddress} onChange={(field, value) => updateAddress('billingAddress', field, value)} />}

              <section className="checkout-address-review" aria-label="Address review">
                <span className="overline">REVIEW BEFORE PAYMENT</span>
                <strong>{customerName || 'Your name'}</strong>
                <span>{checkoutDetails.email || 'Your email'} · {checkoutDetails.phone || 'Your phone'}</span>
                <span>{checkoutDetails.shippingAddress.line1 || 'Delivery street address'}{checkoutDetails.shippingAddress.line2 ? `, ${checkoutDetails.shippingAddress.line2}` : ''}</span>
                <span>{deliveryRegionSummary || 'City, state/province, ZIP/postal code'} · {deliveryCountry}</span>
                {!checkoutDetails.sameBillingAddress && <span>Billing: {checkoutDetails.billingAddress.line1 ? billingAddressSummary : 'Enter your billing address above'}</span>}
              </section>

              <div className="checkout-coupon">
                <label className="checkout-field" htmlFor="checkout-coupon"><span>Discount / coupon code</span><input id="checkout-coupon" name="coupon" autoComplete="off" value={couponCode} onChange={(event) => { setCouponCode(event.target.value); setCouponNotice('') }} placeholder="Enter a code" /></label>
                <button type="button" className="checkout-coupon-button" onClick={() => setCouponNotice(couponCode.trim() ? 'There are no active coupon codes right now. Please contact us if you need help with a promotion.' : 'Enter a coupon code to check it.')}>Apply</button>
                <p className={couponNotice ? 'is-error' : ''} role={couponNotice ? 'status' : undefined}>{couponNotice || <>No active codes right now. <a href="/contact" onClick={(event) => onNavigate(event, '/contact')}>Contact us</a> for promotion questions.</>}</p>
              </div>

              <div className="checkout-payment-method">
                <span className="overline">PAYMENT METHOD</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', border: 'none', padding: 0 }}>
                  <button
                    type="button"
                    onClick={() => setPaymentGateway('paystack')}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '11px 8px',
                      border: paymentGateway === 'paystack' ? '2px solid #282622' : '1px solid var(--line)',
                      background: paymentGateway === 'paystack' ? 'white' : 'transparent',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      font: 'inherit',
                    }}
                  >
                    <PaystackLogo className="h-4 w-auto" />
                    <span style={{ fontSize: '10px', fontWeight: paymentGateway === 'paystack' ? 700 : 500, color: 'var(--ink)' }}>Cards, Bank, Apple Pay</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentGateway('paypal')}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '11px 8px',
                      border: paymentGateway === 'paypal' ? '2px solid #282622' : '1px solid var(--line)',
                      background: paymentGateway === 'paypal' ? 'white' : 'transparent',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      font: 'inherit',
                    }}
                  >
                    <PayPalLogo className="h-4 w-auto" />
                    <span style={{ fontSize: '10px', fontWeight: paymentGateway === 'paypal' ? 700 : 500, color: 'var(--ink)' }}>PayPal & Pay Later</span>
                  </button>
                </div>
              </div>

              <div className="summary-line checkout-final-total"><span>Amount due</span><strong>{formatPrice(finalTotalUsd, currency, exchangeRate)}</strong></div>

              {paymentGateway === 'paystack' ? (
                <button type="submit" className="checkout-button" disabled={checkoutPending} aria-busy={checkoutPending}>
                  {checkoutPending ? <><CircleNotch className="checkout-spinner" size={17} /> Connecting securely</> : <>Review & pay with Paystack <ArrowRight size={17} /></>}
                </button>
              ) : paypalConfig?.enabled ? (
                <div style={{ marginTop: '8px', position: 'relative', zIndex: 10 }}>
                  <PayPalScriptProvider options={{ clientId: paypalConfig.clientId, currency: 'USD' }}>
                    <PayPalButtons
                      style={{ layout: 'vertical', shape: 'rect', color: 'gold', height: 44, label: 'pay' }}
                      disabled={checkoutPending}
                      onClick={(data, actions) => {
                        setCheckoutNotice('')
                        const requiredFields = [
                          { val: checkoutDetails.firstName, label: 'First name' },
                          { val: checkoutDetails.lastName, label: 'Last name' },
                          { val: checkoutDetails.email, label: 'Email address' },
                          { val: checkoutDetails.phone, label: 'Phone number' },
                          { val: checkoutDetails.shippingAddress?.line1, label: 'Street address' },
                          { val: checkoutDetails.shippingAddress?.city, label: 'City' },
                          { val: checkoutDetails.shippingAddress?.region, label: 'State / Province' },
                          { val: checkoutDetails.shippingAddress?.postalCode, label: 'ZIP / Postal code' },
                          { val: checkoutDetails.shippingAddress?.country, label: 'Country / region' },
                          ...(!checkoutDetails.sameBillingAddress ? [
                            { val: checkoutDetails.billingAddress?.line1, label: 'Billing street address' },
                            { val: checkoutDetails.billingAddress?.city, label: 'Billing city' },
                            { val: checkoutDetails.billingAddress?.region, label: 'Billing state / province' },
                            { val: checkoutDetails.billingAddress?.postalCode, label: 'Billing ZIP / postal code' },
                            { val: checkoutDetails.billingAddress?.country, label: 'Billing country / region' },
                          ] : []),
                        ]
                        const missing = requiredFields.find((f) => !f.val || !f.val.trim())
                        if (missing) {
                          setCheckoutNotice(`Please fill in your ${missing.label} under "Your Details" before paying with PayPal.`)
                          return actions.reject()
                        }
                        return actions.resolve()
                      }}
                      createOrder={async () => {
                        setCheckoutPending(true)
                        setCheckoutNotice('')
                        try {
                          const res = await fetch('/api/paypal/create-order', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              checkoutDetails,
                              couponCode,
                              items: cartProducts.map((product) => ({ productId: product.id, variantId: product.variantId || undefined, quantity: product.quantity })),
                            }),
                          })
                          const data = await res.json()
                          if (!res.ok || !data.orderId) throw new Error(data.error || 'Failed to initialize PayPal order.')
                          return data.orderId
                        } catch (err) {
                          setCheckoutNotice(err.message || 'PayPal order creation failed.')
                          setCheckoutPending(false)
                          throw err
                        }
                      }}
                      onApprove={async (data) => {
                        try {
                          const res = await fetch('/api/paypal/capture-order', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId: data.orderID }),
                          })
                          const captureResult = await res.json()
                          if (!res.ok || !captureResult.success) throw new Error(captureResult.error || 'Payment capture failed.')
                          window.location.href = `/checkout/success?session_id=${encodeURIComponent(data.orderID)}&gateway=paypal`
                        } catch (err) {
                          setCheckoutNotice(err.message || 'PayPal payment could not be captured.')
                          setCheckoutPending(false)
                        }
                      }}
                      onError={(err) => {
                        console.error('PayPal button error:', err)
                        setCheckoutNotice((current) => current || 'PayPal could not load or complete checkout. Please try again or choose Paystack.')
                        setCheckoutPending(false)
                      }}
                      onCancel={() => {
                        setCheckoutPending(false)
                      }}
                    />
                  </PayPalScriptProvider>
                </div>
              ) : (
                <p className="checkout-notice" role="status">
                  {paypalConfig ? 'PayPal is not configured right now. Please choose Paystack or contact us for help.' : 'Checking PayPal availability…'}
                </p>
              )}
            </form>

            <div className="checkout-security"><LockKey size={14} /><span>PCI-DSS 256-bit Encrypted Checkout</span></div>
            {checkoutNotice && <p className="checkout-notice" role="status">{checkoutNotice}</p>}
            <a className="checkout-help-link" href="/contact" onClick={(event) => onNavigate(event, '/contact')}>Questions about your order? Contact us</a>
          </aside>
        </div>
      ) : (
        <div className="cart-empty-state"><div className="empty-bag-mark"><ShoppingBag size={25} /></div><h2>Your next favorite is waiting.</h2><p>Your bag is empty, so there’s nothing to check out just yet.</p><a className="hero-cta" href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Find a good thing <ArrowRight size={17} /></a></div>
      )}
    </motion.section>
  )
}

function TrackOrderPage({ onNavigate }) {
  const [orderReference, setOrderReference] = useState(() => new URLSearchParams(window.location.search).get('session_id') || '')
  const [receiptEmail, setReceiptEmail] = useState('')
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setIsChecking(true)
    setError('')
    setOrder(null)
    try {
      const response = await fetch(`/api/checkout_sessions/${encodeURIComponent(orderReference.trim())}?email=${encodeURIComponent(receiptEmail.trim())}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'We could not find that order.')
      setOrder(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'We could not find that order.')
    } finally {
      setIsChecking(false)
    }
  }

  return <motion.section className="track-page section-wrap" aria-labelledby="track-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}><nav className="cart-breadcrumb" aria-label="Breadcrumb"><a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a><span>/</span><span aria-current="page">Track order</span></nav><div className="editorial-page-heading"><span className="overline">A LITTLE UPDATE ON THE WAY</span><h1 id="track-title">Where’s your<br /><em>order now?</em></h1><p>Enter the Paystack checkout reference from your confirmation page or receipt and the email used at checkout.</p></div><form className="track-order-form" onSubmit={handleSubmit}><label htmlFor="order-reference">Checkout reference</label><div><input id="order-reference" value={orderReference} onChange={(event) => setOrderReference(event.target.value)} placeholder="cs_test_…" required /><label htmlFor="receipt-email">Receipt email</label><input id="receipt-email" type="email" autoComplete="email" value={receiptEmail} onChange={(event) => setReceiptEmail(event.target.value)} placeholder="you@example.com" required /><button type="submit" className="checkout-button" disabled={isChecking}>{isChecking ? 'Checking…' : <>Find my order <ArrowRight size={16} /></>}</button></div></form>{error && <p className="checkout-notice track-notice" role="alert">{error}</p>}{order && <section className="track-result" aria-live="polite"><span className="overline">ORDER LOOKUP</span><h2>{order.paymentStatus === 'paid' ? 'Payment confirmed.' : 'Payment is not complete yet.'}</h2><p>{order.paymentStatus === 'paid' ? 'Your order is confirmed with Paystack.' : 'Paystack has not marked this payment as complete.'}</p>{order.orderTotal != null && <div className="summary-line"><span>Order total</span><strong>{formatPrice(order.orderTotal / 100)}</strong></div>}{order.customerEmail && <div className="summary-line"><span>Receipt sent to</span><strong>{order.customerEmail}</strong></div>}<div className="tracking-limit"><strong>Carrier updates</strong><p>Live shipment scans are not connected yet. Your shipping carrier and tracking number will be shared with you by email once the order is fulfilled.</p></div></section>}<p className="track-help">Need a hand? <a href="/contact" onClick={(event) => onNavigate(event, '/contact')}>Contact us <ArrowRight size={14} /></a></p></motion.section>
}

function AboutPage({ onNavigate }) {
  return (
    <motion.section
      className="about-page section-wrap"
      aria-labelledby="about-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <nav className="cart-breadcrumb" aria-label="Breadcrumb">
        <a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">About</span>
      </nav>

      <div className="editorial-page-heading">
        <span className="overline">THE MORROW HOUSE STORY</span>
        <h1 id="about-title">Objects for the art<br /><em>of being home.</em></h1>
        <p>Founded on the belief that a home is not staged, but gathered over time with pieces that bring calm, texture, and lasting warmth.</p>
      </div>

      <div className="about-hero-grid">
        <div className="about-hero-image-wrap">
          <img
            src={imageUrl('photo-1600210492486-724fe5c67fb0', 1600)}
            alt="Warm sunlit living room with natural materials and considered objects"
            className="about-hero-image"
            loading="lazy"
          />
          <span className="story-stamp">Quietly<br />gathered.</span>
        </div>
        <div className="about-hero-copy">
          <span className="overline">OUR PHILOSOPHY</span>
          <h2>A slower pace,<br /><em>a truer room.</em></h2>
          <p>
            Morrow House began with a straightforward conviction: the objects we bring into our daily spaces should make us slow down, feel settled, and take pleasure in everyday rituals.
          </p>
          <p>
            Instead of disposable decor cycles and fleeting novelties, we focus on heirloom materiality—honest oak and walnut, tactile unglazed ceramics, spun brass, and natural woven linens that soften and improve with age.
          </p>
          <div className="about-stat-strip">
            <div className="about-stat">
              <strong>100%</strong>
              <span>Considered &amp; tested designs</span>
            </div>
            <div className="about-stat">
              <strong>30-Day</strong>
              <span>In-home return window</span>
            </div>
            <div className="about-stat">
              <strong>Direct</strong>
              <span>Artisan &amp; workshop sourcing</span>
            </div>
          </div>
        </div>
      </div>

      <div className="about-pillars-section">
        <div className="about-section-header">
          <span className="overline">THE THREE PILLARS</span>
          <h2>How we curate every piece</h2>
          <p>Each object in our catalog must satisfy three unnegotiable standards before it is welcomed into Morrow House.</p>
        </div>

        <div className="about-pillars-grid">
          <article className="about-pillar-card">
            <span className="pillar-num">01</span>
            <h3>Considered Living</h3>
            <p>Every piece is designed to earn its place in a real room. We value proportion, calm palettes, and utility that feels effortless rather than styled or performative.</p>
          </article>

          <article className="about-pillar-card">
            <span className="pillar-num">02</span>
            <h3>Enduring Materials</h3>
            <p>We select solid hardwoods, natural stones, brushed unlacquered metals, and pure woven textiles that wear gracefully into daily living and develop their own patina.</p>
          </article>

          <article className="about-pillar-card">
            <span className="pillar-num">03</span>
            <h3>Honest Provenance</h3>
            <p>We work directly with specialized ateliers, stone masons, and textile mills worldwide—bypassing traditional distributor markups to offer heirloom quality honestly.</p>
          </article>
        </div>
      </div>

      <div className="about-workshop-callout">
        <div className="about-workshop-content">
          <span className="overline">ATELIER &amp; STUDIO</span>
          <h2>Crafted for rituals that repeat.</h2>
          <p>From the morning coffee cup that feels balanced in your palm to the muted amber glow that signals the day is done, our collections are made to ground your daily life.</p>
          <div className="policy-page-links">
            <a href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Explore the collection <ArrowRight size={15} /></a>
            <a href="/contact" onClick={(event) => onNavigate(event, '/contact')}>Speak with our design desk <ArrowRight size={15} /></a>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

const faqData = [
  {
    category: 'Orders',
    items: [
      {
        question: 'How do I place an order?',
        answer: 'Browse our collection, select any desired finishes or variants, and click "Add to bag". When you are ready, navigate to your bag or click "Checkout" to enter your delivery address and complete payment securely via Paystack or PayPal.',
      },
      {
        question: 'Can I cancel or modify my order after placing it?',
        answer: 'Because our studio and fulfillment partners prepare shipments promptly, order modifications or address corrections must be requested within 2 hours of placement. Contact our design desk at concierge@morrowhouse.com or via our contact form with your order reference.',
      },
      {
        question: 'How do I track my order status?',
        answer: 'You can check your order status at any time on our Track Order page using your receipt email and checkout reference. Once your order has been dispatched from our workshop, you will receive an email confirmation with direct tracking details.',
      },
      {
        question: 'Do you offer gift packaging or personalized notes?',
        answer: 'All Morrow House orders are carefully wrapped in unbleached tissue and signature protective craft packaging. If you would like a handwritten gift message included, please reach out to concierge@morrowhouse.com immediately after placing your order.',
      },
    ],
  },
  {
    category: 'Shipping & Delivery',
    items: [
      {
        question: 'Where do you ship?',
        answer: 'We currently deliver throughout the United States and Canada, with select international destinations supported through our regional payment gateways. If your country is not yet supported at checkout, contact our design desk.',
      },
      {
        question: 'What are your shipping rates?',
        answer: 'Standard ground shipping is complimentary on all orders of $150 or more. For orders under $150, ground shipping is a flat $15. Exact shipping costs are calculated and confirmed prior to payment.',
      },
      {
        question: 'How long does delivery take?',
        answer: 'Orders are prepared within 1–2 business days. Standard domestic ground transit typically takes 4–7 business days. Deliveries to remote locations or during peak holiday periods may experience minor carrier delays.',
      },
      {
        question: 'What if an item arrives damaged?',
        answer: 'Each Morrow House piece is rigorously packed to withstand transit. If your piece arrives damaged or defective, please take photographs of the packaging and item and contact us within 48 hours of delivery. We will immediately arrange a complimentary replacement or full refund.',
      },
    ],
  },
  {
    category: 'Payments & Security',
    items: [
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major debit and credit cards (Visa, Mastercard, American Express), PayPal, and Paystack. All transactions are processed through encrypted, PCI-DSS compliant gateways.',
      },
      {
        question: 'Can I view prices in my local currency?',
        answer: 'Yes. You can switch your display currency anytime using the currency selector in the header (USD, EUR, GBP, CAD, AUD, NGN, GHS, KES, ZAR, INR). Converted rates are updated daily via Exchange Rate API. Final checkout is processed in USD.',
      },
      {
        question: 'Is my payment information secure?',
        answer: 'Completely. Morrow House never stores your full payment credentials or card security codes. All transactions utilize 256-bit SSL encryption and strict tokenization.',
      },
    ],
  },
  {
    category: 'Returns & Refunds',
    items: [
      {
        question: 'What is your return window?',
        answer: 'We offer a 30-day return window beginning the day your delivery is completed. Returned pieces must be unused, in their original condition, and safely packaged in their original protective boxes.',
      },
      {
        question: 'How do I start a return?',
        answer: 'Contact our design desk through the Contact page or email concierge@morrowhouse.com with your order reference and the item you wish to return. We will supply return documentation and mailing instructions.',
      },
      {
        question: 'When will I receive my refund?',
        answer: 'Once your return parcel arrives at our inspection atelier, approved refunds are credited back to your original payment method within 3–5 business days. Your card issuer may require an additional 5–10 business days to post the balance.',
      },
      {
        question: 'Are shipping charges refundable?',
        answer: 'Original shipping fees are non-refundable unless the return is due to a defect or transit error on our part. For standard discretionary returns, return postage is the responsibility of the customer.',
      },
    ],
  },
  {
    category: 'Product Care & Craft',
    items: [
      {
        question: 'How should I care for solid wood, ceramic, and metal items?',
        answer: 'Dust gently with a dry or lightly dampened microfiber cloth. Avoid harsh chemical sprays, acidic cleaners, or abrasive sponges. Solid wood benefits from an occasional conditioning with food-safe wax or oil to preserve moisture.',
      },
      {
        question: 'Are Morrow House items covered by a guarantee?',
        answer: 'Yes. Every Morrow House piece carries a 1-year craftsmanship guarantee against material defects and structural failures under regular domestic use.',
      },
      {
        question: 'Where are Morrow House products made?',
        answer: 'We collaborate with specialized artisan workshops and vetted manufacturing partners across Japan, Portugal, Italy, and domestic ateliers who share our standards for ethical craftsmanship, material honesty, and fair labor.',
      },
    ],
  },
]

function FaqPage({ onNavigate }) {
  const [activeCategory, setActiveCategory] = useState('All')
  const [openIndex, setOpenIndex] = useState(null)

  const faqCategories = ['All', ...faqData.map((d) => d.category)]

  const filteredFaqs = useMemo(() => {
    if (activeCategory === 'All') {
      return faqData.flatMap((cat) => cat.items.map((item) => ({ ...item, category: cat.category })))
    }
    const found = faqData.find((d) => d.category === activeCategory)
    return found ? found.items.map((item) => ({ ...item, category: found.category })) : []
  }, [activeCategory])

  function toggleQuestion(idx) {
    setOpenIndex((current) => (current === idx ? null : idx))
  }

  return (
    <motion.section
      className="faq-page section-wrap"
      aria-labelledby="faq-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <nav className="cart-breadcrumb" aria-label="Breadcrumb">
        <a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">FAQ</span>
      </nav>

      <div className="editorial-page-heading">
        <span className="overline">FREQUENTLY ASKED QUESTIONS</span>
        <h1 id="faq-title">Clear answers<br /><em>for your home.</em></h1>
        <p>Everything you need to know about placing an order, shipping destinations, payment security, returns, and taking care of your pieces.</p>
      </div>

      <div className="faq-categories filter-tabs" role="group" aria-label="Filter FAQ topics">
        {faqCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={activeCategory === cat ? 'filter-tab active' : 'filter-tab'}
            aria-pressed={activeCategory === cat}
            onClick={() => {
              setActiveCategory(cat)
              setOpenIndex(null)
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="faq-accordion" role="region" aria-label="Questions and answers">
        {filteredFaqs.map((faq, index) => {
          const isOpen = openIndex === index
          return (
            <div className="faq-item" key={faq.question}>
              <button
                type="button"
                className="faq-question"
                onClick={() => toggleQuestion(index)}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${index}`}
              >
                <span>{faq.question}</span>
                <span className="faq-icon" aria-hidden="true">
                  {isOpen ? <Minus size={18} /> : <Plus size={18} />}
                </span>
              </button>
              {isOpen && (
                <div id={`faq-answer-${index}`} className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="faq-contact-card">
        <div>
          <span className="overline">STILL HAVE QUESTIONS?</span>
          <h3>Our design desk is here to help.</h3>
          <p>Reach out to our concierge for assistance with specific orders, custom sourcing, or styling advice.</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <a href="/contact" className="checkout-button" onClick={(event) => onNavigate(event, '/contact')}>
            Contact us <ArrowRight size={15} />
          </a>
        </div>
      </div>
    </motion.section>
  )
}

function ContactPage({ onNavigate }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('General Inquiry')
  const [orderReference, setOrderReference] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'submitting' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setStatus('submitting')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          orderReference: orderReference.trim(),
          message: message.trim(),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit your message. Please try again.')
      }

      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Unable to submit your message. Please try again.')
    }
  }

  function handleReset() {
    setName('')
    setEmail('')
    setSubject('General Inquiry')
    setOrderReference('')
    setMessage('')
    setStatus('idle')
    setErrorMessage('')
  }

  return (
    <motion.section
      className="information-page section-wrap"
      aria-labelledby="contact-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <nav className="cart-breadcrumb" aria-label="Breadcrumb">
        <a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Contact</span>
      </nav>

      <div className="editorial-page-heading">
        <span className="overline">THE MORROW HOUSE DESIGN DESK</span>
        <h1 id="contact-title">A real person,<br /><em>right this way.</em></h1>
        <p>For help with a piece, an order, or a room that needs a little thought, send us a note.</p>
      </div>

      <div className="contact-layout">
        <div className="contact-note">
          <span className="overline">WE’RE HERE TO HELP</span>
          <h2>Let’s find a good answer.</h2>
          <p>
            Whether you are coordinating dimensions for a dining room, looking up shipment timing, or exploring custom trade projects, our team is at your service.
          </p>
          <div style={{ marginTop: '20px', display: 'grid', gap: '14px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
            <div>
              <strong style={{ color: 'var(--ink)', display: 'block' }}>Concierge Desk</strong>
              <span>concierge@morrowhouse.com</span>
            </div>
            <div>
              <strong style={{ color: 'var(--ink)', display: 'block' }}>Studio Hours</strong>
              <span>Monday – Friday, 9:00 AM – 6:00 PM EST</span>
            </div>
            <div>
              <strong style={{ color: 'var(--ink)', display: 'block' }}>Existing Orders</strong>
              <p style={{ margin: '4px 0 0' }}>Have your checkout reference ready from your confirmation receipt.</p>
            </div>
          </div>
          <div style={{ marginTop: '24px' }}>
            <a href="/track-order" onClick={(event) => onNavigate(event, '/track-order')}>
              Look up an existing order <ArrowRight size={15} />
            </a>
          </div>
        </div>

        {status === 'success' ? (
          <div className="contact-success-state" role="status">
            <CheckCircle size={36} color="var(--wine)" />
            <h3>Your note is on its way.</h3>
            <p>
              Thank you, {name || 'friend'}. Your message has been safely delivered to our design desk. A member of our concierge team will respond within 1–2 business days.
            </p>
            <button type="button" className="checkout-button" onClick={handleReset} style={{ marginTop: '12px' }}>
              Send another note
            </button>
          </div>
        ) : (
          <form className="contact-form" onSubmit={handleSubmit} noValidate>
            {status === 'error' && (
              <div className="form-status-alert is-error" role="alert">
                <WarningCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            <label htmlFor="contact-name">Your name</label>
            <input
              id="contact-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Eleanor Vance"
              required
              disabled={status === 'submitting'}
            />

            <label htmlFor="contact-email">Email address</label>
            <input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={status === 'submitting'}
            />

            <label htmlFor="contact-subject">Topic / inquiry type</label>
            <select
              id="contact-subject"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={status === 'submitting'}
            >
              <option value="General Inquiry">General Inquiry</option>
              <option value="Order & Delivery Status">Order &amp; Delivery Status</option>
              <option value="Product Advice & Sizing">Product Advice &amp; Sizing</option>
              <option value="Return or Exchange Request">Return or Exchange Request</option>
              <option value="Interior Styling & Trade">Interior Styling &amp; Trade</option>
            </select>

            <label htmlFor="contact-order">Order reference <span>optional</span></label>
            <input
              id="contact-order"
              name="order_reference"
              type="text"
              value={orderReference}
              onChange={(e) => setOrderReference(e.target.value)}
              placeholder="e.g. cs_live_... from your receipt"
              disabled={status === 'submitting'}
            />

            <label htmlFor="contact-message">How can we help?</label>
            <textarea
              id="contact-message"
              name="message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what you're looking for, or describe the question you have..."
              required
              disabled={status === 'submitting'}
            />

            <button type="submit" className="checkout-button" disabled={status === 'submitting'}>
              {status === 'submitting' ? (
                <>
                  <CircleNotch size={16} className="spinner" />
                  Sending your note…
                </>
              ) : (
                <>
                  Send your note <ArrowRight size={16} />
                </>
              )}
            </button>
            <p>Our team reviews inquiries Monday through Friday and responds personally.</p>
          </form>
        )}
      </div>
    </motion.section>
  )
}

const policyPages = {
  '/refunds': { title: <>A little time to<br /><em>make yourself at home.</em></>, eyebrow: 'REFUND & RETURN POLICY', updated: 'Our 30-day return window begins on the day your order is delivered.', sections: [['Start a return', 'Contact us within 30 days of delivery with your order reference and the item you would like to return. We will reply with return instructions before you send anything back.'], ['Condition of returned pieces', 'Please return pieces unused and in their original packaging. Items that arrive damaged or are incorrect should be reported to us as soon as possible, with photos if available.'], ['Refunds', 'Once a return is received and reviewed, approved refunds are sent to the original payment method. Your bank or card provider may take additional time to post the refund.'], ['Shipping costs', 'Original shipping charges are not refundable unless the return is due to an error on our part. We will confirm any return-shipping costs and instructions before a return is sent.']] },
  '/shipping': { title: <>Good things,<br /><em>on their way.</em></>, eyebrow: 'SHIPPING POLICY', updated: 'We currently ship to the United States and Canada.', sections: [['Rates', 'Ground shipping is $15 for orders under $150. Orders of $150 or more ship complimentary. The final shipping cost is shown by Paystack before you pay.'], ['Delivery timing', 'Ground orders are estimated to arrive in 4–7 business days after they ship. This is an estimate, not a guaranteed delivery date; carrier or weather delays may add time.'], ['Order updates', 'Paystack emails your receipt after payment. Carrier tracking details are not yet connected to this storefront; we will share them by email when available.'], ['Need help?', 'If your order has not arrived as expected, contact us with your checkout reference so we can look into it.']] },
  '/privacy': { title: <>Your details,<br /><em>treated with care.</em></>, eyebrow: 'PRIVACY POLICY', updated: 'This storefront collects only the information needed to support shopping and checkout.', sections: [['Shopping and cart', 'Your bag is saved in this browser’s local storage so it is still here when you return. This data is stored on your device.'], ['Payments', 'Payment details are collected and processed by Paystack Checkout. This storefront does not receive or store your full card number. Paystack’s privacy policy also applies to checkout.'], ['Order lookups', 'When you submit a Paystack checkout reference on the tracking page, it is sent to our server to retrieve the payment status and limited receipt information from Paystack.'], ['Design assistant', 'If live AI is enabled, the question you submit to the Design Enthusiast is sent to OpenAI to generate a reply. Do not include sensitive personal details. When live AI is unavailable, answers use the local product guide.'], ['Your choices', 'You can clear your saved bag by removing its items or clearing this site’s browser storage. For questions about order information, contact us with your checkout reference.']] },
  '/terms': { title: <>The simple things<br /><em>we agree on.</em></>, eyebrow: 'TERMS & CONDITIONS', updated: 'By using this storefront, you agree to these terms.', sections: [['Products and prices', 'We aim to keep product descriptions, availability, and prices accurate. Prices are shown in US dollars. An order is not accepted until payment has been confirmed by Paystack.'], ['Orders and payment', 'Checkout is provided by Paystack. We may be unable to fulfill an order if an item is unavailable or an order cannot be verified; if payment has been taken, we will arrange a refund.'], ['Shipping and returns', 'Shipping destinations, rates, estimates, and return terms are described in our Shipping and Refund & Return policies. Those pages form part of these terms.'], ['Use of this site', 'Please use the storefront lawfully and do not interfere with its operation, attempt unauthorized access, or submit information that is unlawful or harmful.'], ['Questions', 'Contact us if you have a question about these terms or an order. These terms should be reviewed for your local consumer-protection requirements before the store is used for real sales.']] },
}

function InformationPage({ page, onNavigate }) {
  const sections = page.eyebrow === 'PRIVACY POLICY'
    ? [...page.sections, ['Currency display', 'The shop uses IPWhois.io to estimate your country and suggest a display currency; the detected country code is saved in this browser for up to 24 hours. Converted prices are estimates based on daily Exchange Rate API rates. Checkout currently charges USD.']]
    : page.sections

  return <motion.section className="information-page section-wrap" aria-labelledby="information-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}><nav className="cart-breadcrumb" aria-label="Breadcrumb"><a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a><span>/</span><span aria-current="page">{page.eyebrow}</span></nav><div className="editorial-page-heading"><span className="overline">{page.eyebrow}</span><h1 id="information-title">{page.title}</h1><p>{page.updated}</p></div><div className="policy-content">{sections.map(([heading, text], index) => <article className="policy-section" key={heading}><span>0{index + 1}</span><div><h2>{heading}</h2><p>{text}</p></div></article>)}</div><div className="policy-page-links"><a href="/contact" onClick={(event) => onNavigate(event, '/contact')}>Questions? Contact us <ArrowRight size={15} /></a><a href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Back to the shop <ArrowRight size={15} /></a></div></motion.section>
}

function NotFoundPage({ onNavigate }) {
  return <section className="payment-return section-wrap"><span className="overline">THAT PAGE ISN’T HERE</span><h1>Let’s find<br /><em>something good.</em></h1><p>The link may have changed. The shop is right where you left it.</p><a className="hero-cta" href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Visit the shop <ArrowRight size={17} /></a></section>
}

function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [feedback, setFeedback] = useState('')

  async function handleNewsletterSubmit(event) {
    event.preventDefault()
    setFeedback('')

    const cleanEmail = email.trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setStatus('error')
      setFeedback('Please enter a valid email address.')
      return
    }

    setStatus('loading')
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Subscription failed. Please try again.')
      }

      setStatus('success')
      setFeedback(result.message || 'Thank you for subscribing to Morrow House notes.')
      setEmail('')
    } catch (err) {
      setStatus('error')
      setFeedback(err instanceof Error ? err.message : 'Unable to subscribe. Please try again.')
    }
  }

  return (
    <div>
      {status === 'success' ? (
        <div className="newsletter-feedback is-success" role="status">
          <CheckCircle size={18} />
          <span>{feedback}</span>
        </div>
      ) : (
        <form className="newsletter-form" onSubmit={handleNewsletterSubmit}>
          <label className="sr-only" htmlFor="newsletter-email">Email address</label>
          <input
            id="newsletter-email"
            type="email"
            placeholder="Your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={status === 'loading'}
          />
          <button
            type="submit"
            aria-label="Join the Morrow House newsletter"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? <CircleNotch size={18} className="spinner" /> : <ArrowRight size={19} />}
          </button>
        </form>
      )}
      {status === 'error' && (
        <div className="newsletter-feedback is-error" role="alert">
          <WarningCircle size={16} />
          <span>{feedback}</span>
        </div>
      )}
    </div>
  )
}

function App() {
  const heroRef = useRef(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const heroImageY = useTransform(heroProgress, [0, 1], [0, 36])
  const [activeCategory, setActiveCategory] = useState(() => {
    if (typeof window !== 'undefined' && getRoutePath() === '/shop') {
      const catSlug = new URLSearchParams(window.location.search).get('category')
      return catSlug ? getCategoryFromSlug(catSlug) : 'Everything'
    }
    return 'Everything'
  })
  const [subFilter, setSubFilter] = useState(() => {
    if (typeof window !== 'undefined' && getRoutePath() === '/shop') {
      return new URLSearchParams(window.location.search).get('subfilter') || 'all'
    }
    return 'all'
  })

  function handleShopCategoryChange(category) {
    setActiveCategory(category)
    const params = new URLSearchParams(window.location.search)
    if (category && category !== 'Everything') {
      params.set('category', getCategorySlug(category))
    } else {
      params.delete('category')
    }
    const qs = params.toString() ? `?${params.toString()}` : ''
    window.history.pushState({}, '', `/shop${qs}`)
  }

  function handleShopSubFilterChange(newSubFilter) {
    setSubFilter(newSubFilter)
    const params = new URLSearchParams(window.location.search)
    if (newSubFilter && newSubFilter !== 'all') {
      params.set('subfilter', newSubFilter)
    } else {
      params.delete('subfilter')
    }
    const qs = params.toString() ? `?${params.toString()}` : ''
    window.history.pushState({}, '', `/shop${qs}`)
  }
  const [products, setProducts] = useState([])
  const [currency, setCurrency] = useState(getSavedCurrency)
  const [rates, setRates] = useState({ USD: 1 })
  const [currencyReady, setCurrencyReady] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [heroSlide, setHeroSlide] = useState(0)
  const [heroFocused, setHeroFocused] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [favorites, setFavorites] = useState([])
  const [cartItems, setCartItems] = useState(getSavedCart)
  const [bagNotice, setBagNotice] = useState(null)
  const [currentPath, setCurrentPath] = useState(getRoutePath)
  const bagNoticeTimer = useRef(null)
  const bagNoticeSequence = useRef(0)
  const exchangeRate = Number(rates[currency]) || 1
  const isCartPage = currentPath === '/cart'
  const isCheckoutSuccess = currentPath === '/checkout/success'
  const isCheckoutPage = currentPath === '/checkout'
  const isShopPage = currentPath === '/shop'
  const isHomePage = currentPath === '/'
  const isProductPage = currentPath.startsWith('/product/')
  const currentProduct = isProductPage ? products.find((product) => product.id === currentPath.slice('/product/'.length)) : null
  const checkoutSessionId = new URLSearchParams(window.location.search).get('session_id')
  const hasCheckoutSession = Boolean(checkoutSessionId)
  const [checkoutStatus, setCheckoutStatus] = useState(() =>
    getRoutePath() === '/checkout/success' && !hasCheckoutSession ? 'error' : 'checking',
  )
  const [checkoutError, setCheckoutError] = useState(() =>
    getRoutePath() === '/checkout/success' && !hasCheckoutSession
      ? 'No Paystack checkout reference was included in the return link.'
      : '',
  )

  useEffect(() => {
    if (!isHomePage || reduceMotion || heroFocused) return undefined
    const timer = window.setInterval(() => {
      setHeroSlide((current) => (current + 1) % heroSlides.length)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [heroFocused, heroSlide, isHomePage, reduceMotion])

  useEffect(() => {
    let active = true
    fetch('/api/products')
      .then(async (response) => {
        if (!response.ok) throw new Error('The shop catalog could not be loaded.')
        return response.json()
      })
      .then(({ products: liveProducts }) => {
        if (!active || !Array.isArray(liveProducts)) return
        setProducts((current) => {
          const merged = new Map(current.map((product) => [product.id, product]))
          for (const product of liveProducts) merged.set(product.id, { ...merged.get(product.id), ...product })
          return [...merged.values()]
        })
      })
      .catch((error) => console.error(error))
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true

    async function loadCurrencyPreferences() {
      let currentRates = { USD: 1 }
      try {
        const response = await fetch('/api/exchange-rates')
        if (!response.ok) throw new Error('Exchange rates unavailable.')
        const result = await response.json()
        if (result.base === 'USD' && result.rates?.USD === 1) currentRates = result.rates
      } catch {
        currentRates = { USD: 1 }
      }

      let preferredCurrency = getSavedCurrency()
      try {
        const manuallySelected = Boolean(window.localStorage.getItem(manualCurrencyStorageKey))
        if (!manuallySelected) {
          let savedLocation = null
          try {
            savedLocation = JSON.parse(window.localStorage.getItem(detectedCurrencyStorageKey) || 'null')
          } catch {
            savedLocation = null
          }

          if (!savedLocation || Date.now() - savedLocation.savedAt >= 24 * 60 * 60 * 1000) {
            try {
              const locationResponse = await fetch('https://ipwho.is/?fields=success,country_code', { signal: AbortSignal.timeout(5000) })
              if (!locationResponse.ok) throw new Error('Location lookup unavailable.')
              const location = await locationResponse.json()
              if (!location.success || !location.country_code) throw new Error('Location not detected.')
              savedLocation = { countryCode: location.country_code, savedAt: Date.now() }
            } catch {
              savedLocation = { countryCode: null, savedAt: Date.now() }
            }
            try {
              window.localStorage.setItem(detectedCurrencyStorageKey, JSON.stringify(savedLocation))
            } catch {
              // Keep the default currency if browser storage is unavailable.
            }
          }

          if (savedLocation?.countryCode) {
            preferredCurrency = countryToCurrency[savedLocation.countryCode] || preferredCurrency
          }
        }
      } catch {
        // Keep the saved currency when location detection is unavailable.
      }

      if (!Number.isFinite(currentRates[preferredCurrency])) preferredCurrency = 'USD'
      if (active) {
        setRates(currentRates)
        setCurrency(preferredCurrency)
        setCurrencyReady(true)
      }
    }

    loadCurrencyPreferences()
    return () => { active = false }
  }, [])

  useLayoutEffect(() => {
    window.history.scrollRestoration = 'manual'
    const resetReloadScroll = (event) => {
      if (event.persisted || window.location.hash) return
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
    }
    window.addEventListener('pageshow', resetReloadScroll, { once: true })
    if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    return () => window.removeEventListener('pageshow', resetReloadScroll)
  }, [])

  useEffect(() => {
    const pageTitle = currentPath === '/'
      ? 'Morrow House | Objects for the art of being home'
      : `${({
      '/cart': 'Your bag',
      '/checkout': 'Checkout',
      '/checkout/success': 'Payment confirmed',
      '/shop': 'Shop',
      '/about': 'About our house',
      '/faq': 'Frequently asked questions',
      '/track-order': 'Track your order',
      '/contact': 'Contact us',
      '/refunds': 'Refund & return policy',
      '/shipping': 'Shipping policy',
      '/privacy': 'Privacy policy',
      '/terms': 'Terms & conditions',
      }[currentPath] || currentProduct?.name || 'Page not found')} | Morrow House`
    document.title = pageTitle

    // Dynamic SEO metadata & JSON-LD updates
    let metaDesc = document.querySelector('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.name = 'description'
      document.head.appendChild(metaDesc)
    }

    let productJsonLd = document.getElementById('product-schema-jsonld')
    if (currentProduct) {
      metaDesc.content = `${currentProduct.name} - ${currentProduct.detail} | Morrow House`
      const schemaData = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: currentProduct.name,
        image: `https://images.unsplash.com/${currentProduct.image}?auto=format&fit=crop&w=1000&q=85`,
        description: currentProduct.detail,
        category: currentProduct.category,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'USD',
          price: currentProduct.price,
          availability: 'https://schema.org/InStock',
          url: window.location.href,
        },
      }
      if (!productJsonLd) {
        productJsonLd = document.createElement('script')
        productJsonLd.id = 'product-schema-jsonld'
        productJsonLd.type = 'application/ld+json'
        document.head.appendChild(productJsonLd)
      }
      productJsonLd.text = JSON.stringify(schemaData)
    } else {
      metaDesc.content = 'Considered objects for the rituals, rooms, and very good nights in that make a place yours. Shop Morrow House.'
      if (productJsonLd) productJsonLd.remove()
    }
  }, [currentPath, currentProduct?.name])

  useEffect(() => {
    window.localStorage.setItem('morrow-house-cart', JSON.stringify(cartItems))
  }, [cartItems])

  useEffect(() => () => window.clearTimeout(bagNoticeTimer.current), [])

  useEffect(() => {
    const updateRoute = () => {
      const path = getRoutePath()
      setCurrentPath(path)
      setMobileMenuOpen(false)
      if (path === '/shop') {
        const params = new URLSearchParams(window.location.search)
        const cat = params.get('category')
        const sub = params.get('subfilter')
        setActiveCategory(cat ? getCategoryFromSlug(cat) : 'Everything')
        setSubFilter(sub || 'all')
      }
      const sessionId = new URLSearchParams(window.location.search).get('session_id')
      setCheckoutStatus(path === '/checkout/success' && !sessionId ? 'error' : 'checking')
      setCheckoutError(path === '/checkout/success' && !sessionId ? 'No Paystack checkout reference was included in the return link.' : '')
    }
    window.addEventListener('popstate', updateRoute)
    return () => window.removeEventListener('popstate', updateRoute)
  }, [])

  useEffect(() => {
    if (!isCheckoutSuccess || !checkoutSessionId) return

    let active = true
    const searchParams = new URLSearchParams(window.location.search)
    const isPaystack = searchParams.get('paystack') === 'true'
    const isPayPal = searchParams.get('gateway') === 'paypal'
    const verifyEndpoint = isPayPal
      ? `/api/paypal/verify/${encodeURIComponent(checkoutSessionId)}`
      : isPaystack
      ? `/api/paystack/verify/${encodeURIComponent(checkoutSessionId)}`
      : `/api/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`

    fetch(verifyEndpoint)
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Payment status could not be verified.')
        if (!active) return
        if (result.paymentStatus === 'paid') {
          setCheckoutStatus('paid')
          setCartItems({})
        } else {
          setCheckoutStatus('error')
          setCheckoutError(isPayPal ? 'PayPal has not marked this payment as complete. Your bag has been kept.' : 'Paystack has not marked this payment as complete. Your bag has been kept.')
        }
      })
      .catch((error) => {
        if (!active) return
        setCheckoutStatus('error')
        setCheckoutError(error instanceof Error ? error.message : 'Payment status could not be verified.')
      })

    return () => { active = false }
  }, [checkoutSessionId, isCheckoutSuccess])

  const filteredProducts = products.filter((product) => {
    const matchesCategory = activeCategory === 'Everything' || product.category === activeCategory
    const matchesSearch = `${product.name} ${product.detail} ${product.category} ${product.searchTerms}`
      .toLowerCase()
      .includes(searchTerm.trim().toLowerCase())
    return matchesCategory && matchesSearch
  })
  const trendingProducts = useMemo(() => {
    const explicit = products.filter((product) => product.is_trending || product.public_data?.isTrending || product.badge?.toLowerCase().includes('trending'))
    if (explicit.length > 0) return explicit
    return products.slice(0, 4)
  }, [products])
  const newArrivalsProducts = useMemo(() => {
    return [...products].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0, 4)
  }, [products])
  const cartProducts = Object.entries(cartItems).flatMap(([cartKey, quantity]) => {
    const { productId, variantId } = getCartLineKeyParts(cartKey)
    const product = products.find((item) => item.id === productId)
    if (!product || !Number(quantity)) return []
    const variant = product.variants?.find((item) => item.id === variantId)
    const price = Number(variant?.price || product.price)
    return [{
      ...product,
      cartKey,
      quantity: Number(quantity),
      variantId,
      variant: variant || null,
      price,
      image: variant?.image || product.image,
    }]
  })
  const cartCount = cartProducts.reduce((total, product) => total + product.quantity, 0)
  const subtotal = cartProducts.reduce((total, product) => total + product.price * product.quantity, 0)

  function changeQuantity(cartKey, change) {
    setCartItems((items) => {
      const quantity = Math.max(0, (items[cartKey] || 0) + change)
      const next = { ...items, [cartKey]: quantity }
      if (!quantity) delete next[cartKey]
      return next
    })
  }

  function handleAddToBag(productId, variantId) {
    changeQuantity(getCartKey(productId, variantId), 1)
    const productName = products.find((product) => product.id === productId)?.name || 'Item'
    bagNoticeSequence.current += 1
    setBagNotice({ id: bagNoticeSequence.current, productName })
    window.clearTimeout(bagNoticeTimer.current)
    bagNoticeTimer.current = window.setTimeout(() => setBagNotice(null), 5000)
  }

  function navigateTo(path) {
    window.history.pushState({}, '', path)
    const route = getRoutePath()
    setCurrentPath(route)
    setSearchOpen(false)
    setMobileMenuOpen(false)
    if (route === '/shop') {
      const searchStr = path.includes('?') ? path.slice(path.indexOf('?')) : window.location.search
      const params = new URLSearchParams(searchStr)
      const cat = params.get('category')
      const sub = params.get('subfilter')
      setActiveCategory(cat ? getCategoryFromSlug(cat) : 'Everything')
      setSubFilter(sub || 'all')
    }
    const sessionId = new URLSearchParams(window.location.search).get('session_id')
    setCheckoutStatus(route === '/checkout/success' && !sessionId ? 'error' : 'checking')
    setCheckoutError(route === '/checkout/success' && !sessionId ? 'No Paystack checkout reference was included in the return link.' : '')
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  function handleNavigate(event, path) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigateTo(path)
  }

  function toggleFavorite(productId) {
    setFavorites((items) =>
      items.includes(productId) ? items.filter((item) => item !== productId) : [...items, productId],
    )
  }

  function changeCurrency(nextCurrency) {
    if (!Number.isFinite(rates[nextCurrency])) return
    setCurrency(nextCurrency)
    try {
      window.localStorage.setItem(manualCurrencyStorageKey, nextCurrency)
    } catch {
      // Keep the current page selection even when storage is unavailable.
    }
  }

  return (
    <CurrencyContext.Provider value={{ currency: currencyReady ? currency : 'USD', exchangeRate: currencyReady ? exchangeRate : 1, rates, currencyReady, onCurrencyChange: changeCurrency }}>
    <MotionConfig reducedMotion="user">
      <div className="storefront">
      <motion.div className="reading-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
      <motion.div className="announcement" initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <span>THE HOME RESET EVENT</span>
        <span className="announcement-divider" aria-hidden="true">/</span>
        <a href="/shop" onClick={(event) => handleNavigate(event, '/shop')}>Up to 30% off the pieces worth staying in for <ArrowRight size={13} /></a>
      </motion.div>

      <motion.header className="site-header" initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.05 }}>
        <a className="wordmark" href="/" onClick={(event) => handleNavigate(event, '/')} aria-label="Morrow House home">
          <span className="wordmark-symbol" aria-hidden="true">m.</span>
          <span>MORROW<br />HOUSE</span>
        </a>
        <nav id="main-navigation" className={`main-nav${mobileMenuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <a href="/" aria-current={isHomePage ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/')}>Home</a>
          <a href="/shop" aria-current={isShopPage ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/shop')}>Shop</a>
          <a href="#trending" onClick={(event) => {
            if (!isHomePage) {
              handleNavigate(event, '/#trending')
            } else {
              event.preventDefault()
              setMobileMenuOpen(false)
              const el = document.getElementById('trending')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }
          }}>Trending Now</a>
          <a href="#new-arrivals" onClick={(event) => {
            if (!isHomePage) {
              handleNavigate(event, '/#new-arrivals')
            } else {
              event.preventDefault()
              setMobileMenuOpen(false)
              const el = document.getElementById('new-arrivals')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }
          }}>New Arrivals</a>
          <a href="/about" aria-current={currentPath === '/about' ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/about')}>About</a>
          <a href="/track-order" aria-current={currentPath === '/track-order' ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/track-order')}>Track order</a>
        </nav>
        <div className="header-actions">
          <CurrencySelector />
          {(isHomePage || isShopPage) && <button type="button" className="icon-button search-toggle" aria-label={searchOpen ? 'Close search' : 'Search the shop'} onClick={() => { setMobileMenuOpen(false); setSearchOpen((open) => !open) }}>{searchOpen ? <X size={20} /> : <MagnifyingGlass size={20} />}</button>}
          <a href="/cart" className="bag-button" aria-current={isCartPage ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/cart')} aria-label={`Shopping bag, ${cartCount} items`}>
            <ShoppingBag size={19} /><span className="bag-label">Bag</span><AnimatePresence initial={false} mode="popLayout"><motion.span key={cartCount} className="bag-count" initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.75, opacity: 0 }} transition={{ duration: 0.18 }}>{cartCount}</motion.span></AnimatePresence>
          </a>
          <button type="button" className="icon-button mobile-menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="main-navigation" onClick={() => { setSearchOpen(false); setMobileMenuOpen((open) => !open) }}>
            {mobileMenuOpen ? <X size={21} aria-hidden="true" /> : <List size={21} aria-hidden="true" />}
          </button>
        </div>
      </motion.header>

      <AnimatePresence initial={false}>
        {bagNotice && <motion.div key={bagNotice.id} className="bag-nudge" role="status" aria-live="polite" initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: reduceMotion ? 0.01 : 0.2 }}>
          <span className="sr-only">{bagNotice.productName} added. </span>
          <a href="/cart" onClick={(event) => handleNavigate(event, '/cart')}>Check your bag <ArrowRight size={15} aria-hidden="true" /></a>
        </motion.div>}
      </AnimatePresence>

      <AnimatePresence initial={false}>
      {searchOpen && (
        <motion.form className="search-bar" role="search" onSubmit={(event) => event.preventDefault()} initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          <MagnifyingGlass size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="shop-search">Search products</label>
          <input id="shop-search" type="search" placeholder="Try ‘the lamp guests keep asking about’" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          {searchTerm && <button type="button" onClick={() => setSearchTerm('')}>Clear</button>}
        </motion.form>
      )}
      </AnimatePresence>

      <main id="top">
        <AnimatePresence mode="wait" initial={false}>
        {isCheckoutSuccess ? (
          <motion.div key="payment-return" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>
            <CheckoutSuccess status={checkoutStatus} error={checkoutError} sessionId={checkoutSessionId} onNavigate={handleNavigate} />
          </motion.div>
        ) : isCartPage ? (
          <motion.div key="cart-page" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>
            <CartPage cartProducts={cartProducts} cartItems={cartItems} cartCount={cartCount} subtotal={subtotal} changeQuantity={changeQuantity} onNavigate={handleNavigate} />
          </motion.div>
        ) : isCheckoutPage ? (
          <motion.div key="checkout-page" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>
            <CheckoutPage cartProducts={cartProducts} cartItems={cartItems} cartCount={cartCount} subtotal={subtotal} onNavigate={handleNavigate} />
          </motion.div>
        ) : isShopPage ? (
          <motion.div key="shop-page" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>
            <ShopPage
              products={products}
              activeCategory={activeCategory}
              onSelectCategory={handleShopCategoryChange}
              subFilter={subFilter}
              onSelectSubFilter={handleShopSubFilterChange}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onNavigate={handleNavigate}
            />
          </motion.div>
        ) : isProductPage ? (
          <ProductPage product={currentProduct} products={products} onNavigate={handleNavigate} onAdd={handleAddToBag} />
        ) : currentPath === '/track-order' ? (
          <TrackOrderPage onNavigate={handleNavigate} />
        ) : currentPath === '/about' ? (
          <AboutPage onNavigate={handleNavigate} />
        ) : currentPath === '/faq' ? (
          <FaqPage onNavigate={handleNavigate} />
        ) : currentPath === '/contact' ? (
          <ContactPage onNavigate={handleNavigate} />
        ) : policyPages[currentPath] ? (
          <InformationPage page={policyPages[currentPath]} onNavigate={handleNavigate} />
        ) : !isHomePage ? (
          <NotFoundPage onNavigate={handleNavigate} />
        ) : (
          <motion.div key="store-home" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>
        <section
          className="hero"
          aria-labelledby="hero-title"
          ref={heroRef}
          onFocusCapture={() => setHeroFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setHeroFocused(false)
          }}
        >
          <AnimatePresence initial={false}>
            <motion.img
              key={heroSlides[heroSlide].image}
              className="hero-image"
              src={imageUrl(heroSlides[heroSlide].image, 2200)}
              alt={heroSlides[heroSlide].alt}
              fetchPriority={heroSlide === 0 ? 'high' : 'auto'}
              initial={reduceMotion ? false : { opacity: 0, scale: 1.025 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.8, ease: [0.22, 1, 0.36, 1] }}
              style={{ y: reduceMotion ? 0 : heroImageY }}
            />
          </AnimatePresence>
          <div className="hero-shade" />
          <motion.div className="hero-content" variants={reduceMotion ? undefined : revealGroup} initial={reduceMotion ? false : 'hidden'} animate="visible">
            <motion.span className="hero-kicker" variants={reduceMotion ? undefined : revealItem}><span /> A little more home, a little less ordinary</motion.span>
            <motion.h1 id="hero-title" variants={reduceMotion ? undefined : revealItem}>The pieces<br />they'll ask<br /><em>where you found.</em></motion.h1>
            <motion.p variants={reduceMotion ? undefined : revealItem}>Considered objects for the rituals, rooms, and very good nights in that make a place yours.</motion.p>
            <motion.a className="hero-cta" href="#bestsellers" variants={reduceMotion ? undefined : revealItem} whileHover={reduceMotion ? undefined : { x: 4 }}>Find your new favorite <ArrowRight size={17} /></motion.a>
            <nav className={`hero-controls${reduceMotion ? ' is-static' : ''}`} aria-label="Choose a hero image">
              {heroSlides.map((slide, index) => (
                <button key={slide.image} type="button" className={`hero-control${heroSlide === index ? ' is-active' : ''}`} aria-label={`Show image ${index + 1}: ${slide.note.toLowerCase()}`} aria-current={heroSlide === index ? 'true' : undefined} onClick={() => setHeroSlide(index)}>
                  <span className="hero-control-label">{String(index + 1).padStart(2, '0')} <span>{slide.label}</span></span>
                  <span className="hero-control-track"><span /></span>
                </button>
              ))}
            </nav>
          </motion.div>
          <motion.div className="hero-note" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.5 }}><span>FIELD NOTES</span><i aria-hidden="true" /><span>{heroSlides[heroSlide].note}</span></motion.div>
          {products[0] && <motion.a className="hero-product-note" href={`/product/${products[0].id}`} onClick={(event) => handleNavigate(event, `/product/${products[0].id}`)} initial={reduceMotion ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8, duration: 0.4 }}><span className="note-dot" /> Meet the {products[0].name} <ArrowRight size={14} /></motion.a>}
        </section>

        <motion.div className="service-strip" aria-label="Shopping benefits" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.65 }} variants={reduceMotion ? undefined : revealItem}>
          <span>Thoughtfully made, never mass produced</span><span className="service-mark" aria-hidden="true">✳</span>
          <span>Complimentary shipping over {formatPrice(150, currency, exchangeRate)}</span><span className="service-mark" aria-hidden="true">✳</span>
          <span>30 days to make yourself at home</span>
        </motion.div>

        <section className="category-section section-wrap" id="categories">
          <motion.div className="section-intro" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.65 }} variants={reduceMotion ? undefined : revealItem}>
            <div><span className="overline">A ROOM OF YOUR OWN</span><h2>Where should we start?</h2></div>
            <a className="text-link" href="/shop" onClick={(event) => handleNavigate(event, '/shop')}>Shop the whole house <ArrowRight size={15} /></a>
          </motion.div>
          <motion.div className="category-grid" variants={reduceMotion ? undefined : revealGroup} initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.16 }}>
            {categories.map((category, index) => (
              <motion.a className={`category-tile category-${index + 1}`} href="#bestsellers" key={category.name} onClick={() => setActiveCategory(category.name)} variants={reduceMotion ? undefined : revealItem} whileHover={reduceMotion ? undefined : { y: -4 }}>
                <img src={imageUrl(category.image, 1000)} alt="" loading="lazy" />
                <span className="category-index">0{index + 1}</span>
                <span className="category-label"><span>{category.label}</span><strong>{category.name}<ArrowRight size={17} /></strong></span>
              </motion.a>
            ))}
          </motion.div>
        </section>

        <section className="bestsellers-section" id="bestsellers">
          <div className="section-wrap">
            <motion.div className="section-intro product-intro" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.65 }} variants={reduceMotion ? undefined : revealItem}>
              <div><span className="overline">A FRIENDLY WARNING: THESE GO QUICK</span><h2>The ones that make the room.</h2></div>
              <span className="product-count">{filteredProducts.length} considered favorites</span>
            </motion.div>
            <motion.div className="product-toolbar" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.7 }} variants={reduceMotion ? undefined : revealItem}>
              <div className="filter-tabs" role="group" aria-label="Filter products by category">
                {['Everything', ...categories.map((category) => category.name)].map((category) => (
                  <button className={activeCategory === category ? 'filter-tab active' : 'filter-tab'} type="button" aria-pressed={activeCategory === category} key={category} onClick={() => setActiveCategory(category)}>{category}</button>
                ))}
              </div>
              <span className="sort-note">Made for keeping <span aria-hidden="true">↘</span></span>
            </motion.div>

            {filteredProducts.length > 0 ? (
              activeCategory === 'Everything'
                ? <ProductCollectionShelves products={filteredProducts} onNavigate={handleNavigate} onSelectCategory={setActiveCategory} favorites={favorites} onToggleFavorite={toggleFavorite} />
                : <motion.div className="product-grid" layout>
                  <AnimatePresence initial={false} mode="popLayout">
                    {filteredProducts.map((product, index) => <ProductTile key={product.id} product={product} index={index} onNavigate={handleNavigate} />)}
                  </AnimatePresence>
                </motion.div>
            ) : (
              <motion.div className="empty-results" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}><p>No pieces found for “{searchTerm}”.</p><button type="button" className="text-link" onClick={() => { setSearchTerm(''); setActiveCategory('Everything') }}>See everything <ArrowRight size={15} /></button></motion.div>
            )}
          </div>
        </section>

        <section className="bestsellers-section" id="trending" style={{ paddingTop: '2.5rem' }}>
          <div className="section-wrap">
            <motion.div className="section-intro product-intro" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.65 }} variants={reduceMotion ? undefined : revealItem}>
              <div><span className="overline">COMMUNITY HIGHLIGHTS</span><h2>Trending Now</h2><p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '15px' }}>Pieces explicitly marked and celebrated by our design community.</p></div>
              <a className="text-link" href="/shop" onClick={(event) => { handleNavigate(event, '/shop') }}>Shop all trending <ArrowRight size={15} /></a>
            </motion.div>
            <div className="product-collection-row">
              {trendingProducts.map((product, index) => (
                <ProductTile key={`trending-${product.id}`} product={product} index={index} onNavigate={handleNavigate} isFavorite={favorites?.includes(product.id)} onToggleFavorite={toggleFavorite} />
              ))}
            </div>
          </div>
        </section>

        <section className="bestsellers-section" id="new-arrivals" style={{ paddingTop: '2.5rem' }}>
          <div className="section-wrap">
            <motion.div className="section-intro product-intro" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.65 }} variants={reduceMotion ? undefined : revealItem}>
              <div><span className="overline">FRESH FROM OUR STUDIOS</span><h2>New Arrivals</h2><p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '15px' }}>Recently published additions, ordered by arrival date and ready for home.</p></div>
              <a className="text-link" href="/shop" onClick={(event) => { handleNavigate(event, '/shop') }}>Explore latest finds <ArrowRight size={15} /></a>
            </motion.div>
            <div className="product-collection-row">
              {newArrivalsProducts.map((product, index) => (
                <ProductTile key={`new-${product.id}`} product={product} index={index} onNavigate={handleNavigate} isFavorite={favorites?.includes(product.id)} onToggleFavorite={toggleFavorite} />
              ))}
            </div>
          </div>
        </section>

        <DesignEnthusiast />

        <section className="story-section" id="story">
          <div className="story-image">
            <motion.img src={imageUrl('photo-1600607687939-ce8a6c25118c', 1400)} alt="A calm, lived-in home filled with natural wood and soft light" loading="lazy" initial={reduceMotion ? false : { opacity: 0, scale: 1.025 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
            <span className="story-stamp">Less, but<br />more you.</span>
          </div>
          <motion.div className="story-copy" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={reduceMotion ? undefined : revealGroup}>
            <motion.span className="overline" variants={reduceMotion ? undefined : revealItem}>THE MORROW HOUSE WAY</motion.span>
            <motion.h2 variants={reduceMotion ? undefined : revealItem}>Not another thing.<br /><em>The right thing.</em></motion.h2>
            <motion.p variants={reduceMotion ? undefined : revealItem}>We believe the best rooms aren't finished. They're collected slowly, lived in fully, and made unmistakably yours. So we look for pieces with a point of view, a little soul, and a reason to stay.</motion.p>
            <motion.a className="text-link" href="#categories" variants={reduceMotion ? undefined : revealItem} whileHover={reduceMotion ? undefined : { x: 3 }}>Get to know your next favorite <ArrowRight size={15} /></motion.a>
          </motion.div>
        </section>

        <motion.section className="newsletter-section" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.35 }} variants={reduceMotion ? undefined : revealGroup}>
          <motion.span className="overline" variants={reduceMotion ? undefined : revealItem}>A GOOD NOTE, NOW AND THEN</motion.span>
          <motion.h2 variants={reduceMotion ? undefined : revealItem}>For the love of being home.</motion.h2>
          <motion.p variants={reduceMotion ? undefined : revealItem}>New finds, good rooms, and first dibs. Never the usual inbox noise.</motion.p>
          <motion.div variants={reduceMotion ? undefined : revealItem}>
            <NewsletterForm />
          </motion.div>
          <motion.span className="newsletter-small" variants={reduceMotion ? undefined : revealItem}>By signing up, you agree to receive occasional notes from us.</motion.span>
        </motion.section>
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      <motion.footer className="site-footer" initial={reduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
        <div className="footer-brand"><a className="wordmark footer-wordmark" href="/" onClick={(event) => handleNavigate(event, '/') }><span className="wordmark-symbol" aria-hidden="true">m.</span><span>MORROW<br />HOUSE</span></a><p>Objects for the art of being home.</p><a className="rate-attribution" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by Exchange Rate API</a><span>Display conversions are estimates; checkout is in USD.</span><span>© 2026 Morrow House</span></div>
        <div className="footer-link-group"><strong>Explore</strong><a href="/" onClick={(event) => handleNavigate(event, '/')}>Home</a><a href="/shop" onClick={(event) => handleNavigate(event, '/shop')}>Shop all</a><a href="/about" onClick={(event) => handleNavigate(event, '/about')}>About</a><a href="#trending" onClick={(event) => { if (!isHomePage) handleNavigate(event, '/#trending'); else document.getElementById('trending')?.scrollIntoView({ behavior: 'smooth' }) }}>Trending Now</a><a href="#new-arrivals" onClick={(event) => { if (!isHomePage) handleNavigate(event, '/#new-arrivals'); else document.getElementById('new-arrivals')?.scrollIntoView({ behavior: 'smooth' }) }}>New Arrivals</a><a href="/cart" onClick={(event) => handleNavigate(event, '/cart')}>Your bag</a><a href="/track-order" onClick={(event) => handleNavigate(event, '/track-order')}>Track order</a></div>
        <div className="footer-link-group"><strong>Categories</strong>{categories.map((cat) => <a key={cat.name} href={`/shop?category=${getCategorySlug(cat.name)}`} onClick={(event) => { handleNavigate(event, `/shop?category=${getCategorySlug(cat.name)}`) }}>{cat.name}</a>)}</div>
        <div className="footer-link-group"><strong>Here to help</strong><a href="/contact" onClick={(event) => handleNavigate(event, '/contact')}>Contact us</a><a href="/faq" onClick={(event) => handleNavigate(event, '/faq')}>FAQ</a><a href="/refunds" onClick={(event) => handleNavigate(event, '/refunds')}>Refunds & returns</a><a href="/shipping" onClick={(event) => handleNavigate(event, '/shipping')}>Shipping</a></div>
        <div className="footer-link-group"><strong>The details</strong><a href="/privacy" onClick={(event) => handleNavigate(event, '/privacy')}>Privacy</a><a href="/terms" onClick={(event) => handleNavigate(event, '/terms')}>Terms & conditions</a></div>
      </motion.footer>

    </div>
    </MotionConfig>
    </CurrencyContext.Provider>
  )
}

export default App

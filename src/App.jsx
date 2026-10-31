import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react'
import { ArrowRight, CheckCircle, CircleNotch, Heart, LockKey, MagnifyingGlass, Minus, PaperPlaneRight, Plus, ShoppingBag, Sparkle, Trash, WarningCircle, X } from '@phosphor-icons/react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import countryToCurrency from 'country-to-currency'
import RibbonGlow from './components/RibbonGlow.jsx'
import { PaystackLogo } from './components/PaymentLogos.jsx'
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
  { name: 'Living', label: 'A softer place to land', image: 'photo-1600210492486-724fe5c67fb0' },
  { name: 'Lighting', label: 'Set a different mood', image: 'photo-1507473885765-e6ed057f782c' },
  { name: 'Objects', label: 'The little things, considered', image: 'photo-1490312278390-ab64016e0aa9' },
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
    if (!messages.length && !isAnswering) return
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

function CartPage({ cartProducts, cartItems, cartCount, subtotal, changeQuantity, onNavigate }) {
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
                <motion.article className="cart-page-item" key={product.id} layout initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.24 }}>
                  <img src={imageUrl(product.image, 360)} alt={`${product.name}`} />
                  <div className="cart-page-item-info">
                    <span className="cart-item-category">{product.category}</span>
                    <h2>{product.name}</h2>
                    <p>{product.detail}</p>
                    <div className="cart-page-item-controls">
                      <div className="quantity-control" aria-label={`Quantity for ${product.name}`}>
                        <button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label={`Remove one ${product.name}`}><Minus size={13} /></button>
                        <span>{cartItems[product.id]}</span>
                        <button type="button" onClick={() => changeQuantity(product.id, 1)} aria-label={`Add one ${product.name}`}><Plus size={13} /></button>
                      </div>
                      <button type="button" className="remove-item" onClick={() => changeQuantity(product.id, -cartItems[product.id])} aria-label={`Remove ${product.name} from bag`}><Trash size={15} /><span>Remove</span></button>
                    </div>
                  </div>
                  <strong className="cart-page-item-total">{formatPrice(product.price * cartItems[product.id], currency, exchangeRate)}</strong>
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

function ProductTile({ product, index, onNavigate, onAdd, isFavorite, onToggleFavorite }) {
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
          <motion.div
            className="relative group"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          >
            <img
              src={imageUrl(product.image, 900)}
              alt={`${product.name} in a thoughtfully styled interior`}
              loading="lazy"
              className="transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-95"
            />
            <span className="absolute inset-0"></span>
          </motion.div>
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

function ProductCollectionShelves({ products, onNavigate, onAdd, onSelectCategory, favorites, onToggleFavorite }) {
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
        {collection.products.map((product, index) => <ProductTile key={product.id} product={product} index={index} onNavigate={onNavigate} onAdd={onAdd} isFavorite={favorites?.includes(product.id)} onToggleFavorite={onToggleFavorite} />)}
      </div>
    </section>)}
  </div>
}

function AddToBagButton({ product, className, compact = false, onAdd }) {
  const reduceMotion = useReducedMotion()
  const [added, setAdded] = useState(false)

  function handleAdd() {
    onAdd(product.id)
    setAdded(true)
  }

  return (
    <motion.button
      type="button"
      className={`${className}${added ? ' is-added' : ''}`}
      onClick={handleAdd}
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
          </motion.span>
        ) : (
          <motion.span
            key="label"
            className={`add-to-bag-label${compact ? ' is-compact' : ''}`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.16 }}
          >
            {compact ? <><Plus size={16} /><span>Add to bag</span></> : <>Add to bag <Plus size={17} /></>}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function ShopPage({ products, activeCategory, setActiveCategory, searchTerm, setSearchTerm, onNavigate, onAdd }) {
  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === 'Everything' || product.category === activeCategory
    const matchesSearch = `${product.name} ${product.detail} ${product.category} ${product.searchTerms}`.toLowerCase().includes(searchTerm.trim().toLowerCase())
    return matchesCategory && matchesSearch
  })

  const [subFilter, setSubFilter] = useState('all')

  // Filter/sort products based on subFilter
  const filteredProducts = useMemo(() => {
    if (!visibleProducts.length) return visibleProducts

    switch (subFilter) {
      case 'new-arrivals':
        // Sort by ID descending (assuming higher ID = newer)
        return [...visibleProducts].sort((a, b) => b.id - a.id)
      case 'under-200':
        // Filter products under $200
        return visibleProducts.filter(product => product.price < 200)
      case 'best-sellers':
        // Placeholder: sort by name A-Z (since we don't have real sales data)
        return [...visibleProducts].sort((a, b) => a.name.localeCompare(b.name))
      case 'all':
      default:
        return visibleProducts
    }
  }, [visibleProducts, subFilter])

  return (
    <motion.section className="shop-page section-wrap" aria-labelledby="shop-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <nav className="cart-breadcrumb" aria-label="Breadcrumb"><a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a><span aria-hidden="true">/</span><span aria-current="page">Shop</span></nav>
      <div className="editorial-page-heading"><span className="overline">A ROOM OF YOUR OWN</span><h1 id="shop-title">Good things<br /><em>for living in.</em></h1><p>Considered pieces for slower mornings, softer evenings, and the spaces in between.</p></div>
      <div className="shop-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filter products by category">
          {['Everything', ...categories.map((category) => category.name)].map((category) => <button className={activeCategory === category ? 'filter-tab active' : 'filter-tab'} type="button" aria-pressed={activeCategory === category} key={category} onClick={() => setActiveCategory(category)}>{category}</button>)}
        </div>
        <span className="product-count">{visibleProducts.length} considered favorites</span>
      </div>

      {/* Sub-filter options when viewing a specific category */}
      {activeCategory !== 'Everything' && visibleProducts.length && (
        <div className="filter-tabs" style={{ marginTop: '1rem' }} role="group" aria-label="Sort and filter products">
          <button
            className={subFilter === 'all' ? 'filter-tab active' : 'filter-tab'}
            type="button"
            onClick={() => setSubFilter('all')}
          >
            All
          </button>
          <button
            className={subFilter === 'new-arrivals' ? 'filter-tab active' : 'filter-tab'}
            type="button"
            onClick={() => setSubFilter('new-arrivals')}
          >
            New Arrivals
          </button>
          <button
            className={subFilter === 'under-200' ? 'filter-tab active' : 'filter-tab'}
            type="button"
            onClick={() => setSubFilter('under-200')}
          >
            Under $200
          </button>
          <button
            className={subFilter === 'best-sellers' ? 'filter-tab active' : 'filter-tab'}
            type="button"
            onClick={() => setSubFilter('best-sellers')}
          >
            Best Sellers
          </button>
        </div>
      )}

      {visibleProducts.length ? activeCategory === 'Everything'
        ? <ProductCollectionShelves products={visibleProducts} onNavigate={onNavigate} onAdd={onAdd} onSelectCategory={setActiveCategory} />
        : <div className="product-grid shop-product-grid">{filteredProducts.map((product, index) => <ProductTile key={product.id} product={product} index={index} onNavigate={onNavigate} onAdd={onAdd} />)}</div>
        : <div className="empty-results"><p>No pieces found for “{searchTerm}”.</p><button type="button" className="text-link" onClick={() => { setSearchTerm(''); setActiveCategory('Everything') }}>Clear filters <ArrowRight size={15} /></button></div>}
    </motion.section>
  )
}

function ProductPage({ product, products, onNavigate, onAdd }) {
  const reduceMotion = useReducedMotion()
  const { currency, exchangeRate } = useCurrency()
  if (!product) return <NotFoundPage onNavigate={onNavigate} />
  const relatedProducts = products.filter((item) => item.id !== product.id)

  return (
    <motion.section className="product-page section-wrap" aria-labelledby="product-title" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <nav className="cart-breadcrumb" aria-label="Breadcrumb"><a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a><span aria-hidden="true">/</span><a href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Shop</a><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span></nav>
      <div className="product-detail-layout">
        <motion.div className="product-detail-image" initial={reduceMotion ? false : { opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55 }}><img src={imageUrl(product.image, 1400)} alt={`${product.name} styled in a home`} /></motion.div>
        <div className="product-detail-copy"><span className="overline">{product.category} · MORROW HOUSE</span><h1 id="product-title">{product.name}</h1><span className="product-detail-price">{formatPrice(product.price, currency, exchangeRate)}</span><p className="product-detail-description">{product.detail}. A thoughtful piece, chosen to feel at home from the very first day.</p><p className="product-detail-badge">{product.badge}</p><AddToBagButton product={product} onAdd={onAdd} className="checkout-button" /><a className="product-detail-cart-link" href="/cart" onClick={(event) => onNavigate(event, '/cart')}>View your bag <ArrowRight size={15} /></a><div className="product-service-notes"><a href="/shipping" onClick={(event) => onNavigate(event, '/shipping')}>Complimentary shipping over $150</a><a href="/refunds" onClick={(event) => onNavigate(event, '/refunds')}>30 days to make yourself at home</a></div></div>
      </div>
      <section className="related-products" aria-labelledby="related-products-title"><div className="section-intro"><div><span className="overline">A FEW GOOD COMPANIONS</span><h2 id="related-products-title">Make room for more.</h2></div><a className="text-link" href="/shop" onClick={(event) => onNavigate(event, '/shop')}>Shop everything <ArrowRight size={15} /></a></div><div className="product-grid">{relatedProducts.slice(0, 3).map((item, index) => <ProductTile key={item.id} product={item} index={index} onNavigate={onNavigate} onAdd={onAdd} />)}</div></section>
    </motion.section>
  )
}

function CheckoutPage({ cartProducts, cartItems, cartCount, subtotal, onNavigate }) {
  const { currency, exchangeRate, rates } = useCurrency()
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [checkoutNotice, setCheckoutNotice] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerName, setCustomerName] = useState('')

  const freeShipping = subtotal >= 150
  const finalTotalUsd = subtotal + (freeShipping ? 0 : 15)

  async function handlePaystackCheckout(e) {
    e.preventDefault()
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      setCheckoutNotice('Please enter a valid email address to receive your order receipt.')
      return
    }

    setCheckoutPending(true)
    setCheckoutNotice('')

    try {
      const ngnRate = Number(rates['NGN']) || 1480
      const totalNgn = Math.round(finalTotalUsd * ngnRate)

      const response = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: customerEmail.trim(),
          customerName: customerName.trim() || 'Morrow House Client',
          items: cartProducts.map((product) => ({ productId: product.id, quantity: cartItems[product.id] })),
          amountUsd: finalTotalUsd,
          amountNgn: totalNgn,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to initialize Paystack checkout.')
      }

      const win = window
      const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
      const paystackPublicKey = 'pk_live_d2e4bb883f45096a034c3ed24d0ef6565d1a5484'

      if (!isMobile && win.PaystackPop && typeof win.PaystackPop.setup === 'function') {
        try {
          const handler = win.PaystackPop.setup({
            key: paystackPublicKey,
            email: customerEmail.trim(),
            amount: Math.round(totalNgn * 100),
            currency: 'NGN',
            ref: data.reference,
            metadata: {
              orderId: data.orderId,
              customerName: customerName.trim() || 'Morrow House Client',
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
        } catch (popupErr) {
          console.warn('Paystack popup fallback to redirect:', popupErr)
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
              <article className="checkout-review-item" key={product.id}>
                <img src={imageUrl(product.image, 260)} alt="" />
                <div>
                  <strong>{product.name}</strong>
                  <span>{product.detail}</span>
                  <span>Qty {cartItems[product.id]}</span>
                </div>
                <b>{formatPrice(product.price * cartItems[product.id], currency, exchangeRate)}</b>
              </article>
            ))}
            <a className="continue-shopping" href="/cart" onClick={(event) => onNavigate(event, '/cart')}>Edit your bag <ArrowRight size={15} /></a>
          </section>

          <aside className="order-summary checkout-summary">
            <span className="overline">THE IMPORTANT DETAILS</span>
            <h2>Order summary</h2>
            <div className="summary-line"><span>Items · {cartCount} {cartCount === 1 ? 'piece' : 'pieces'}</span><strong>{formatPrice(subtotal, currency, exchangeRate)}</strong></div>
            <div className="summary-line summary-muted"><span>Shipping</span><span>{freeShipping ? 'Complimentary' : formatPrice(15, currency, exchangeRate)}</span></div>
            <div className="summary-total"><span>Total</span><strong>{formatPrice(finalTotalUsd, currency, exchangeRate)}</strong></div>

            <form onSubmit={handlePaystackCheckout} style={{ marginTop: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="paystack-email" style={{ display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontWeight: 600 }}>Email Address *</label>
                <input
                  id="paystack-email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '4px', marginBottom: '8px', fontSize: '14px', background: '#fff' }}
                />
                <label htmlFor="paystack-name" style={{ display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontWeight: 600 }}>Full Name</label>
                <input
                  id="paystack-name"
                  type="text"
                  placeholder="Your name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '4px', fontSize: '14px', background: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 10px', background: '#f5f5f3', borderRadius: '4px' }}>
                <PaystackLogo className="h-4 w-auto" />
                <span style={{ fontSize: '12px', color: '#555' }}>Supports Cards, Bank Transfer, Apple Pay, & USSD</span>
              </div>

              <button type="submit" className="checkout-button" disabled={checkoutPending} aria-busy={checkoutPending}>
                {checkoutPending ? (
                  <><CircleNotch className="checkout-spinner" size={17} /> Connecting securely</>
                ) : (
                  <>Pay with Paystack <ArrowRight size={17} /></>
                )}
              </button>
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

function ContactPage({ onNavigate }) {
  return <motion.section className="information-page section-wrap" aria-labelledby="contact-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}><nav className="cart-breadcrumb" aria-label="Breadcrumb"><a href="/" onClick={(event) => onNavigate(event, '/')}>Home</a><span>/</span><span aria-current="page">Contact</span></nav><div className="editorial-page-heading"><span className="overline">THE MORROW HOUSE DESIGN DESK</span><h1 id="contact-title">A real person,<br /><em>right this way.</em></h1><p>For help with a piece, an order, or a room that needs a little thought, send us a note.</p></div><div className="contact-layout"><div className="contact-note"><span className="overline">WE’RE HERE TO HELP</span><h2>Let’s find a good answer.</h2><p>For an existing order, include the checkout reference from your receipt so we can find the right details.</p><a href="/track-order" onClick={(event) => onNavigate(event, '/track-order')}>Look up an order <ArrowRight size={15} /></a></div><form className="contact-form" action="mailto:hello@morrowhouse.com" method="post" encType="text/plain"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" autoComplete="name" required /><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" autoComplete="email" required /><label htmlFor="contact-order">Order reference <span>optional</span></label><input id="contact-order" name="order_reference" /><label htmlFor="contact-message">How can we help?</label><textarea id="contact-message" name="message" rows="5" required /><button type="submit" className="checkout-button">Open your email app <ArrowRight size={16} /></button><p>Your email app will open with your note ready to send. No message is submitted or stored on this site.</p></form></div></motion.section>
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

function App() {
  const heroRef = useRef(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const heroImageY = useTransform(heroProgress, [0, 1], [0, 36])
  const [activeCategory, setActiveCategory] = useState('Everything')
  const [products, setProducts] = useState([])
  const [currency, setCurrency] = useState(getSavedCurrency)
  const [rates, setRates] = useState({ USD: 1 })
  const [currencyReady, setCurrencyReady] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
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
      '/track-order': 'Track your order',
      '/contact': 'Contact us',
      '/refunds': 'Refund & return policy',
      '/shipping': 'Shipping policy',
      '/privacy': 'Privacy policy',
      '/terms': 'Terms & conditions',
      }[currentPath] || currentProduct?.name || 'Page not found')} | Morrow House`
    document.title = pageTitle
  }, [currentPath, currentProduct?.name])

  useEffect(() => {
    window.localStorage.setItem('morrow-house-cart', JSON.stringify(cartItems))
  }, [cartItems])

  useEffect(() => () => window.clearTimeout(bagNoticeTimer.current), [])

  useEffect(() => {
    const updateRoute = () => {
      const path = getRoutePath()
      setCurrentPath(path)
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
    const isPaystack = new URLSearchParams(window.location.search).get('paystack') === 'true'
    const verifyEndpoint = isPaystack
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
          setCheckoutError('Paystack has not marked this payment as complete. Your bag has been kept.')
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
  const cartCount = Object.values(cartItems).reduce((total, quantity) => total + quantity, 0)
  const subtotal = products.reduce((total, product) => total + product.price * (cartItems[product.id] || 0), 0)
  const cartProducts = products.filter((product) => cartItems[product.id])

  function changeQuantity(productId, change) {
    setCartItems((items) => {
      const quantity = Math.max(0, (items[productId] || 0) + change)
      return { ...items, [productId]: quantity }
    })
  }

  function handleAddToBag(productId) {
    changeQuantity(productId, 1)
    const productName = products.find((product) => product.id === productId)?.name || 'Item'
    bagNoticeSequence.current += 1
    setBagNotice({ id: bagNoticeSequence.current, productName })
    window.clearTimeout(bagNoticeTimer.current)
    bagNoticeTimer.current = window.setTimeout(() => setBagNotice(null), 5000)
  }

  function navigateTo(path) {
    window.history.pushState({}, '', path)
    setCurrentPath(getRoutePath())
    setSearchOpen(false)
    const sessionId = new URLSearchParams(window.location.search).get('session_id')
    setCheckoutStatus(path === '/checkout/success' && !sessionId ? 'error' : 'checking')
    setCheckoutError(path === '/checkout/success' && !sessionId ? 'No Paystack checkout reference was included in the return link.' : '')
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
        <nav className="main-nav" aria-label="Main navigation">
          <a href="/" aria-current={isHomePage ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/')}>Home</a>
          <a href="/shop" aria-current={isShopPage ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/shop')}>Shop</a>
          <a href="/track-order" aria-current={currentPath === '/track-order' ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/track-order')}>Track order</a>
        </nav>
        <div className="header-actions">
          <CurrencySelector />
          {(isHomePage || isShopPage) && <button type="button" className="icon-button search-toggle" aria-label={searchOpen ? 'Close search' : 'Search the shop'} onClick={() => setSearchOpen((open) => !open)}>{searchOpen ? <X size={20} /> : <MagnifyingGlass size={20} />}</button>}
          <a href="/cart" className="bag-button" aria-current={isCartPage ? 'page' : undefined} onClick={(event) => handleNavigate(event, '/cart')} aria-label={`Shopping bag, ${cartCount} items`}>
            <ShoppingBag size={19} /><span>Bag</span><AnimatePresence initial={false} mode="popLayout"><motion.span key={cartCount} className="bag-count" initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.75, opacity: 0 }} transition={{ duration: 0.18 }}>{cartCount}</motion.span></AnimatePresence>
          </a>
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
            <ShopPage products={products} activeCategory={activeCategory} setActiveCategory={setActiveCategory} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onNavigate={handleNavigate} onAdd={handleAddToBag} />
          </motion.div>
        ) : isProductPage ? (
          <ProductPage product={currentProduct} products={products} onNavigate={handleNavigate} onAdd={handleAddToBag} />
        ) : currentPath === '/track-order' ? (
          <TrackOrderPage onNavigate={handleNavigate} />
        ) : currentPath === '/contact' ? (
          <ContactPage onNavigate={handleNavigate} />
        ) : policyPages[currentPath] ? (
          <InformationPage page={policyPages[currentPath]} onNavigate={handleNavigate} />
        ) : !isHomePage ? (
          <NotFoundPage onNavigate={handleNavigate} />
        ) : (
          <motion.div key="store-home" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>
        <section className="hero" aria-labelledby="hero-title" ref={heroRef}>
          <motion.img className="hero-image" src={imageUrl('photo-1600210492486-724fe5c67fb0', 2200)} alt="Sunlit living room with sculptural furniture and warm natural textures" fetchPriority="high" initial={reduceMotion ? false : { opacity: 0, scale: 1.035 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} style={{ y: reduceMotion ? 0 : heroImageY }} />
          <div className="hero-shade" />
          <motion.div className="hero-content" variants={reduceMotion ? undefined : revealGroup} initial={reduceMotion ? false : 'hidden'} animate="visible">
            <motion.span className="hero-kicker" variants={reduceMotion ? undefined : revealItem}><span /> A little more home, a little less ordinary</motion.span>
            <motion.h1 id="hero-title" variants={reduceMotion ? undefined : revealItem}>The pieces<br />they'll ask<br /><em>where you found.</em></motion.h1>
            <motion.p variants={reduceMotion ? undefined : revealItem}>Considered objects for the rituals, rooms, and very good nights in that make a place yours.</motion.p>
            <motion.a className="hero-cta" href="#bestsellers" variants={reduceMotion ? undefined : revealItem} whileHover={reduceMotion ? undefined : { x: 4 }}>Find your new favorite <ArrowRight size={17} /></motion.a>
          </motion.div>
          <motion.div className="hero-note" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.5 }}><span>01 / 03</span><span>THE ART OF STAYING IN</span></motion.div>
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
                {['Everything', 'Living', 'Lighting', 'Objects'].map((category) => (
                  <button className={activeCategory === category ? 'filter-tab active' : 'filter-tab'} type="button" aria-pressed={activeCategory === category} key={category} onClick={() => setActiveCategory(category)}>{category}</button>
                ))}
              </div>
              <span className="sort-note">Made for keeping <span aria-hidden="true">↘</span></span>
            </motion.div>

            {filteredProducts.length > 0 ? (
              activeCategory === 'Everything'
                ? <ProductCollectionShelves products={filteredProducts} onNavigate={handleNavigate} onAdd={handleAddToBag} onSelectCategory={setActiveCategory} favorites={favorites} onToggleFavorite={toggleFavorite} />
                : <motion.div className="product-grid" layout>
                  <AnimatePresence initial={false} mode="popLayout">
                    {filteredProducts.map((product, index) => <ProductTile key={product.id} product={product} index={index} onNavigate={handleNavigate} onAdd={handleAddToBag} />)}
                  </AnimatePresence>
                </motion.div>
            ) : (
              <motion.div className="empty-results" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}><p>No pieces found for “{searchTerm}”.</p><button type="button" className="text-link" onClick={() => { setSearchTerm(''); setActiveCategory('Everything') }}>See everything <ArrowRight size={15} /></button></motion.div>
            )}
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
          <motion.form className="newsletter-form" onSubmit={(event) => event.preventDefault()} variants={reduceMotion ? undefined : revealItem}>
            <label className="sr-only" htmlFor="newsletter-email">Email address</label>
            <input id="newsletter-email" type="email" placeholder="Your email address" required />
            <button type="submit" aria-label="Join the Morrow House newsletter"><ArrowRight size={19} /></button>
          </motion.form>
          <motion.span className="newsletter-small" variants={reduceMotion ? undefined : revealItem}>By signing up, you agree to receive occasional notes from us.</motion.span>
        </motion.section>
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      <motion.footer className="site-footer" initial={reduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
        <div className="footer-brand"><a className="wordmark footer-wordmark" href="/" onClick={(event) => handleNavigate(event, '/') }><span className="wordmark-symbol" aria-hidden="true">m.</span><span>MORROW<br />HOUSE</span></a><p>Objects for the art of being home.</p><a className="rate-attribution" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by Exchange Rate API</a><span>Display conversions are estimates; checkout is in USD.</span><span>© 2026 Morrow House</span></div>
        <div className="footer-link-group"><strong>Explore</strong><a href="/" onClick={(event) => handleNavigate(event, '/')}>Home</a><a href="/shop" onClick={(event) => handleNavigate(event, '/shop')}>Shop all</a><a href="/cart" onClick={(event) => handleNavigate(event, '/cart')}>Your bag</a><a href="/track-order" onClick={(event) => handleNavigate(event, '/track-order')}>Track order</a></div>
        <div className="footer-link-group"><strong>Here to help</strong><a href="/contact" onClick={(event) => handleNavigate(event, '/contact')}>Contact us</a><a href="/refunds" onClick={(event) => handleNavigate(event, '/refunds')}>Refunds & returns</a><a href="/shipping" onClick={(event) => handleNavigate(event, '/shipping')}>Shipping</a></div>
        <div className="footer-link-group"><strong>The details</strong><a href="/privacy" onClick={(event) => handleNavigate(event, '/privacy')}>Privacy</a><a href="/terms" onClick={(event) => handleNavigate(event, '/terms')}>Terms & conditions</a></div>
      </motion.footer>

    </div>
    </MotionConfig>
    </CurrencyContext.Provider>
  )
}

export default App

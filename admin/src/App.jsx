import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, ChartBar, Check, CircleNotch, Clock, Cube, House, LockKey, MagnifyingGlass, Minus, Package, Plus, SignOut, SquaresFour, TrendUp, Truck, WarningCircle, X } from '@phosphor-icons/react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { formatCurrency, imageUrl } from './format.js'

const navigation = [
  { id: 'overview', label: 'Overview', icon: SquaresFour },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Cube },
  { id: 'supplier', label: 'Supplier', icon: ArrowUpRight },
]

async function adminRequest(path, options = {}) {
  const response = await fetch(`/api/admin/${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'The admin service could not complete that request.')
  return result
}

function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await adminRequest('login', { method: 'POST', body: JSON.stringify({ password }) })
      await onLogin()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sign in failed.')
    } finally {
      setPending(false)
      setPassword('')
    }
  }

  return (
    <main className="admin-login-shell">
      <div className="login-side-note"><span className="brand-mark">m.</span><span>PRIVATE WORKSPACE<br />MORROW HOUSE · EST. 2024</span></div>
      <motion.section className="login-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
        <span className="eyebrow"><LockKey size={13} /> OWNER ACCESS ONLY</span>
        <h1>Good morning,<br /><em>let’s get to work.</em></h1>
        <p className="login-intro">This local workspace is private. Sign in with the admin passphrase from your environment file.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-password">Admin passphrase</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={16} required autoFocus />
          {error && <p className="form-error" role="alert"><WarningCircle size={15} />{error}</p>}
          <button className="primary-button" type="submit" disabled={pending}>{pending ? <><CircleNotch className="spin" size={17} /> Checking access</> : <>Open dashboard <ArrowRight size={17} /></>}</button>
        </form>
        <p className="login-footnote"><span />Loopback-only · No public sign-in</p>
      </motion.section>
      <span className="login-edition">AN OBJECTS FOR LIVING COMPANY</span>
    </main>
  )
}

function PreviewBanner({ mode = 'empty' }) {
  const isLive = mode === 'live'
  return <div className={`preview-banner ${isLive ? 'is-live' : ''}`}><span><WarningCircle size={16} weight="fill" /> {isLive ? 'LIVE DATA' : 'EMPTY DATA'}</span><p>{isLive ? 'This dashboard is connected to your Supabase tables and updates in real time.' : 'No records are available. Add data to Supabase to populate this dashboard.'}</p>{isLive && <span className="live-badge">Supabase active</span>}</div>
}

function Metric({ label, value, change, icon: Icon, tone = '' }) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-heading"><span>{label}</span><Icon size={18} weight="regular" /></div>
      <strong>{value}</strong>
      <span className="metric-change"><ArrowUpRight size={13} />{change}</span>
    </article>
  )
}

function RevenueChart({ data }) {
  const safeData = Array.isArray(data) ? data : []
  const max = Math.max(...safeData.map((day) => Number(day.amount) || 0), 1)

  return (
    <section className="panel revenue-panel" aria-labelledby="revenue-title">
      <div className="panel-heading"><div><span className="eyebrow">A WEEK AT A GLANCE</span><h2 id="revenue-title">Revenue</h2></div><span className="chart-total">{formatCurrency(safeData.reduce((total, day) => total + (Number(day.amount) || 0), 0))}<small>7 days</small></span></div>
      <div className="revenue-chart" role="img" aria-label={`Revenue over seven days, ${safeData.map((day) => `${day.day} ${formatCurrency(Number(day.amount) || 0)}`).join(', ')}`}>
        {safeData.map((day, index) => <div className="chart-column" key={day.day}><span className="chart-bar-value">{formatCurrency(Number(day.amount) || 0)}</span><div className={`chart-bar ${index === safeData.length - 1 ? 'is-current' : ''}`} style={{ height: `${(Number(day.amount) || 0) === 0 ? 0 : Math.max(10, ((Number(day.amount) || 0) / max) * 100)}%` }} /><span className="chart-day">{day.day}</span></div>)}
      </div>
      <div className="chart-caption"><span><i />Daily revenue</span><span>Previous 7 days</span></div>
    </section>
  )
}

function OrdersTable({ orders, onStatusChange, compact = false }) {
  return (
    <div className={`table-scroll ${compact ? 'is-compact' : ''}`}>
      <table className="orders-table">
        <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id}>
          <td><span className="order-number">{order.id}</span></td>
          <td><span className="customer-name">{order.customer}</span><span className="customer-email">{order.email}</span></td>
          <td className="placed-date">{order.placed}</td>
          <td>{order.items}</td>
          <td className="order-total">{formatCurrency(order.total)}</td>
          <td><label className="sr-only" htmlFor={`status-${order.id}`}>Status for order {order.id}</label><select id={`status-${order.id}`} className={`order-status status-${order.status.toLowerCase()}`} value={order.status} onChange={(event) => onStatusChange(order.id, event.target.value)}><option value="">—</option>{['Paid', 'Processing', 'Fulfilled', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></td>
        </tr>)}</tbody>
      </table>
      {!orders.length && <div className="table-empty">No orders match your search.</div>}
    </div>
  )
}

function InventoryTable({ products, onStockChange }) {
  return (
    <div className="table-scroll">
      <table className="inventory-table">
        <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>In stock</th><th>Stock health</th></tr></thead>
        <tbody>{products.map((product) => {
          const lowStock = product.stock <= product.reorderAt
          return <tr key={product.id}>
            <td><div className="inventory-product">{product.image && <img src={imageUrl(product.image, 120)} alt="" />}<div><strong>{product.name}</strong><span>{product.id}</span></div></div></td>
            <td className="sku">{product.sku}</td><td>{product.category}</td><td>{formatCurrency(product.price)}</td>
            <td><div className="stock-stepper"><button type="button" aria-label={`Remove one ${product.name} from stock`} disabled={product.stock === 0} onClick={() => onStockChange(product.id, product.stock - 1)}><Minus size={13} /></button><strong>{product.stock}</strong><button type="button" aria-label={`Add one ${product.name} to stock`} onClick={() => onStockChange(product.id, product.stock + 1)}><Plus size={13} /></button></div></td>
            <td><span className={`stock-health ${lowStock ? 'is-low' : 'is-healthy'}`}><i />{lowStock ? 'Reorder soon' : 'In good shape'}</span></td>
          </tr>
        })}</tbody>
      </table>
      {!products.length && <div className="table-empty">No products match your search.</div>}
    </div>
  )
}

function SupplierTable({ products, syncSummary = {}, onApprove, onImportProduct, onSearchProducts, importPanelRef, importInputRef }) {
  const summary = syncSummary || {}
  const lastUpdated = summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No sync yet'
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [searchPending, setSearchPending] = useState(false)
  const [importingId, setImportingId] = useState('')
  const [profitMargin, setProfitMargin] = useState('50')
  const importedIds = new Set(products.map((product) => product.id))

  function getRetailPrice(product) {
    const cost = Number(product.price)
    const margin = Number(profitMargin)
    if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(margin) || margin < 0 || margin >= 100) return 0
    return Math.round((cost / (1 - margin / 100)) * 100) / 100
  }

  function getPublishStock(product) {
    const stock = Math.floor(Number(product.stock))
    return Number.isFinite(stock) ? Math.min(9999, Math.max(0, stock)) : 0
  }

  function canApprove(product) {
    return getRetailPrice(product) > 0 && getPublishStock(product) > 0
  }

  async function handleSearch(event) {
    event.preventDefault()
    if (!searchQuery.trim() || !onSearchProducts) return
    setSearchPending(true)
    setSearchError('')
    setSearchResults([])
    try {
      const result = await onSearchProducts(searchQuery.trim())
      setSearchResults(Array.isArray(result?.products) ? result.products : [])
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'The CJ search could not complete.')
    } finally {
      setSearchPending(false)
    }
  }

  async function handleImport(productId) {
    setImportingId(productId)
    try {
      await onImportProduct(productId)
    } finally {
      setImportingId('')
    }
  }

  return (
    <>
      <section className="panel supplier-overview" ref={importPanelRef}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CJ PIPELINE</span>
            <h2>Supplier sync status</h2>
          </div>
          <span className="sync-pill">Updated {lastUpdated}</span>
        </div>
        <div className="sync-metrics">
          <div className="sync-stat"><span>Imported</span><strong>{summary.imported ?? 0}</strong></div>
          <div className="sync-stat"><span>Approved</span><strong>{summary.approved ?? 0}</strong></div>
          <div className="sync-stat"><span>Pending</span><strong>{summary.pending ?? 0}</strong></div>
        </div>
        <div className="sync-log-wrap">
          <h3>Recent approval activity</h3>
          <ul className="sync-log-list">{(summary.logs || []).length ? (summary.logs || []).map((entry) => <li key={entry.id}><span className={`sync-log-status ${entry.status}`}>{entry.status}</span><div><strong>{entry.entityType}</strong><small>{entry.message}</small></div><time>{entry.createdAt ? new Date(entry.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</time></li>) : <li className="sync-log-empty">No approval history yet.</li>}</ul>
        </div>
        <div className="supplier-search-panel">
          <form className="supplier-search-form" onSubmit={handleSearch}>
            <label htmlFor="cj-product-search">Find products on CJ</label>
            <div className="supplier-import-row">
              <input ref={importInputRef} id="cj-product-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by product name or keyword" />
              <button type="submit" className="primary-button supplier-import-button" disabled={searchPending || !searchQuery.trim()}>{searchPending ? <><CircleNotch className="spin" size={14} />Searching</> : <><MagnifyingGlass size={14} />Search CJ</>}</button>
            </div>
          </form>
          {searchError && <p className="form-error supplier-lookup-error" role="alert"><WarningCircle size={14} />{searchError}</p>}
          {searchPending && <div className="supplier-search-status" role="status">Searching the live CJ catalog…</div>}
          {!searchPending && searchResults.length > 0 && <div className="supplier-search-results" aria-label="CJ search results">
            {searchResults.map((product) => <article className="supplier-search-result" key={product.id}>
              {product.image ? <img src={imageUrl(product.image, 160)} alt="" /> : <div className="supplier-search-image" aria-hidden="true"><Package size={20} /></div>}
              <div className="supplier-search-copy"><strong>{product.name}</strong><span>{product.sku || product.id}</span><small>{product.category} · from {formatCurrency(Number(product.price || 0))}</small></div>
              <button type="button" className="supplier-result-import" disabled={Boolean(importingId) || importedIds.has(product.id)} onClick={() => handleImport(product.id)}>{importingId === product.id ? <CircleNotch className="spin" size={14} /> : importedIds.has(product.id) ? <Check size={14} /> : <Plus size={14} />}<span>{importingId === product.id ? 'Importing' : importedIds.has(product.id) ? 'Imported' : 'Import'}</span></button>
            </article>)}
          </div>}
          {!searchPending && searchQuery.trim() && !searchError && searchResults.length === 0 && <p className="supplier-search-status">No CJ products found. Try another keyword.</p>}
        </div>
      </section>

      <section className="panel table-panel supplier-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CJ IMPORTS</span>
            <h2>Supplier review queue</h2>
          </div>
          <label className="supplier-margin-control" title="Gross margin = (retail price - CJ cost) / retail price">
            <span>Profit margin</span>
            <span className="supplier-margin-input"><input type="number" min="0" max="99" step="1" value={profitMargin} onChange={(event) => setProfitMargin(event.target.value)} aria-label="Profit margin percentage" /><b>%</b></span>
          </label>
        </div>
        <div className="table-scroll">
          <table className="inventory-table">
            <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>CJ price</th><th>Retail price</th><th>CJ stock</th><th>Status</th></tr></thead>
            <tbody>{products.map((product) => <tr key={product.id}>
              <td><div className="inventory-product">{product.image && <img src={imageUrl(product.image, 120)} alt="" />}<div><strong>{product.name}</strong><span>{product.id}</span></div></div></td>
              <td className="sku">{product.sku || '—'}</td>
              <td>{product.category}</td>
              <td>{formatCurrency(product.price || 0)}</td>
              <td>{getRetailPrice(product) > 0 ? formatCurrency(getRetailPrice(product)) : '—'}</td>
              <td>{getPublishStock(product) || 'Unavailable'}</td>
              <td><div className="supplier-actions"><span className={`stock-health ${product.isActive ? 'is-healthy' : 'is-low'}`}><i />{product.isActive ? 'Active' : 'Pending'}</span><button type="button" className="supplier-approve" disabled={!canApprove(product)} onClick={() => onApprove(product.id, getRetailPrice(product), getPublishStock(product))}>Publish</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!products.length && <div className="table-empty">No imported CJ products are queued yet.</div>}
      </section>
    </>
  )
}

function Dashboard({ data, onReload, onLogout, onUpdateStock, onUpdateOrder, onApproveSupplier, onImportSupplier, onSearchSupplier, message, pending }) {
  const [activeView, setActiveView] = useState('overview')
  const [search, setSearch] = useState('')
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const [quickImportJump, setQuickImportJump] = useState(0)
  const supplierImportPanelRef = useRef(null)
  const supplierImportInputRef = useRef(null)
  const lowStock = data.products.filter((product) => product.stock <= product.reorderAt)
  const filteredOrders = useMemo(() => data.orders.filter((order) => `${order.id} ${order.customer} ${order.email} ${order.status}`.toLowerCase().includes(search.trim().toLowerCase())), [data.orders, search])
  const filteredProducts = useMemo(() => data.products.filter((product) => `${product.name} ${product.category} ${product.sku}`.toLowerCase().includes(search.trim().toLowerCase())), [data.products, search])
  const revenue = data.revenue.reduce((total, day) => total + day.amount, 0)
  const orderCount = data.orders.length
  const averageOrder = orderCount ? data.orders.reduce((total, order) => total + order.total, 0) / orderCount : 0
  const currentView = navigation.find((item) => item.id === activeView)
  const title = currentView?.label || 'Overview'
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
  const updated = new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  useEffect(() => {
    if (activeView !== 'supplier' || quickImportJump === 0) return undefined
    const frame = window.requestAnimationFrame(() => {
      supplierImportPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      supplierImportInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeView, quickImportJump])

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${mobileNavigationOpen ? 'is-open' : ''}`}>
        <a className="admin-brand" href="#overview" onClick={() => setActiveView('overview')}><span className="brand-mark">m.</span><span><strong>MORROW HOUSE</strong><small>PRIVATE ADMIN</small></span></a>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Admin navigation">{navigation.map(({ id, label, icon: Icon }) => <button className={activeView === id ? 'is-active' : ''} type="button" key={id} onClick={() => { setActiveView(id); setMobileNavigationOpen(false); setSearch('') }}><Icon size={18} />{label}{id === 'orders' && <span className="nav-count">{data.orders.length}</span>}{id === 'inventory' && lowStock.length > 0 && <span className="nav-alert">{lowStock.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="owner-card"><span className="owner-avatar">MH</span><div><strong>Owner access</strong><small>Local session</small></div><span className="online-dot" /></div><button type="button" className="logout-button" onClick={onLogout}><SignOut size={17} />Sign out</button><span className="sidebar-version">MORROW HOUSE · ADMIN 0.1</span></div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar"><button type="button" className="mobile-menu-button" aria-label={mobileNavigationOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMobileNavigationOpen((open) => !open)}>{mobileNavigationOpen ? <X size={19} /> : <SquaresFour size={19} />}</button><div className="topbar-location"><House size={14} /><span>/</span><strong>{title}</strong></div><div className="topbar-actions"><label className="admin-search"><MagnifyingGlass size={16} /><input aria-label={`Search ${activeView === 'inventory' ? 'inventory' : 'orders'}`} placeholder={activeView === 'inventory' ? 'Search products' : 'Search orders'} value={search} onChange={(event) => setSearch(event.target.value)} /></label><button type="button" className="topbar-icon" title="Last refreshed" aria-label={`Last refreshed at ${updated}`} onClick={onReload}><Clock size={18} /></button><button type="button" className="topbar-icon notification-icon" title="Low-stock products" aria-label={`${lowStock.length} low-stock products`} onClick={() => setActiveView('inventory')}><Bell size={18} />{lowStock.length > 0 && <i />}</button><span className="topbar-divider" /><span className="owner-chip"><span>MH</span>Owner</span></div></header>

        <main className="dashboard-content">
          <PreviewBanner mode={data.mode} />
          <div className="page-heading"><div><span className="eyebrow">{activeView === 'overview' ? todayLabel : 'MORROW HOUSE · OPERATIONS'}</span><h1>{activeView === 'overview' ? <>A good day to<br /><em>make things happen.</em></> : title}</h1><p>{activeView === 'overview' ? 'Here’s the shape of the shop this week.' : activeView === 'orders' ? 'Stay close to every good thing on its way.' : 'Keep every considered piece accounted for.'}</p></div><div className="page-heading-actions"><button type="button" className="quick-import-button" onClick={() => { setActiveView('supplier'); setMobileNavigationOpen(false); setSearch(''); setQuickImportJump((count) => count + 1) }}><ArrowDown size={15} />CJ Import</button><button type="button" className="refresh-button" onClick={onReload} disabled={pending}><CircleNotch className={pending ? 'spin' : ''} size={16} />Refresh</button></div></div>

          {message && <div className="admin-message" role="status"><Check size={15} />{message}</div>}
          {pending && <div className="loading-line" aria-label="Saving changes"><span /></div>}

          {activeView === 'overview' && <motion.div key="overview" className="view-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
            <section className="metric-grid" aria-label="Store metrics"><Metric label="Revenue · 7 days" value={formatCurrency(revenue)} change="0% vs last week" icon={TrendUp} tone="metric-revenue" /><Metric label="Orders · all statuses" value={String(orderCount)} change="0 need attention" icon={Package} /><Metric label="Average order value" value={formatCurrency(averageOrder)} change="0% vs last week" icon={ChartBar} /><Metric label="Low-stock products" value={String(lowStock.length)} change={lowStock.length ? 'Reorder recommended' : '0'} icon={WarningCircle} tone={lowStock.length ? 'metric-warning' : ''} /></section>
            <div className="overview-grid"><RevenueChart data={data.revenue} /><section className="panel stock-panel" aria-labelledby="stock-title"><div className="panel-heading"><div><span className="eyebrow">A LITTLE ATTENTION</span><h2 id="stock-title">Stock watch</h2></div><button className="panel-link" type="button" onClick={() => setActiveView('inventory')}>All inventory <ArrowRight size={14} /></button></div>{lowStock.length ? <div className="stock-watch-list">{lowStock.map((product) => <div className="stock-watch-item" key={product.id}>{product.image && <img src={imageUrl(product.image, 100)} alt="" />}<div><strong>{product.name}</strong><span>{product.category} · reorder at {product.reorderAt}</span></div><b className="stock-watch-count">{product.stock} left</b></div>)}</div> : <div className="stock-all-good"><Check size={18} /><span>0 items need attention.</span></div>}<button className="stock-action" type="button" onClick={() => setActiveView('inventory')}>Review stock levels <ArrowRight size={15} /></button></section></div>
            <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Latest orders</h2></div><button className="panel-link" type="button" onClick={() => setActiveView('orders')}>All orders <ArrowRight size={14} /></button></div><OrdersTable orders={filteredOrders.slice(0, 4)} onStatusChange={onUpdateOrder} compact /></section>
            <div className="dashboard-footnote"><span>{data.mode === 'live' ? 'Live workspace' : 'Empty workspace'}</span><span>Last refreshed {updated}</span></div>
          </motion.div>}

          {activeView === 'orders' && <motion.section key="orders" className="panel table-panel full-table-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}><div className="panel-heading"><div><span className="eyebrow">{data.orders.length} RECENT ORDERS</span><h2>Every order, in one place.</h2></div><div className="table-heading-note"><Truck size={17} /><span>Carrier tracking not connected</span></div></div><OrdersTable orders={filteredOrders} onStatusChange={onUpdateOrder} /><p className="table-footnote">{data.mode === 'live' ? 'Status changes persist to the connected Supabase order table.' : 'Empty workspace — no order records are available yet.'}</p></motion.section>}

          {activeView === 'inventory' && <motion.section key="inventory" className="panel table-panel full-table-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}><div className="panel-heading"><div><span className="eyebrow">{data.products.length} LISTED PRODUCTS</span><h2>Count what matters.</h2></div><span className="table-heading-note"><span className="stock-legend-dot" /> Low stock at reorder point</span></div><InventoryTable products={filteredProducts} onStockChange={onUpdateStock} /><p className="table-footnote">{data.mode === 'live' ? 'Stock changes persist to the connected Supabase products table.' : 'Empty workspace — no product records are available yet.'}</p></motion.section>}

          {activeView === 'supplier' && <motion.section key="supplier" className="supplier-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}><SupplierTable products={data.supplier || []} syncSummary={data.syncSummary || {}} onApprove={onApproveSupplier} onImportProduct={onImportSupplier} onSearchProducts={onSearchSupplier} importPanelRef={supplierImportPanelRef} importInputRef={supplierImportInputRef} /></motion.section>}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const reduceMotion = useReducedMotion()
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [loadError, setLoadError] = useState('')

  async function loadDashboard() {
    setPending(true)
    setLoadError('')
    try {
      const dashboard = await adminRequest('dashboard')
      setData({
        ...dashboard,
        supplier: Array.isArray(dashboard.supplier) ? dashboard.supplier : [],
        syncSummary: dashboard.syncSummary || { imported: 0, approved: 0, pending: 0, logs: [] },
      })
      setAuthenticated(true)
    } catch (error) {
      setAuthenticated(false)
      setLoadError(error instanceof Error ? error.message : 'Dashboard data could not be loaded.')
    } finally {
      setCheckingSession(false)
      setPending(false)
    }
  }

  useEffect(() => {
    adminRequest('session').then((session) => {
      if (session.authenticated) return loadDashboard()
      setCheckingSession(false)
      return undefined
    }).catch(() => setCheckingSession(false))
  }, [])

  async function updateRecord(path, body, successMessage) {
    setPending(true)
    setMessage('')
    try {
      await adminRequest(path, { method: 'PATCH', body: JSON.stringify(body) })
      await loadDashboard()
      setMessage(successMessage)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'That change could not be saved.')
    } finally {
      setPending(false)
    }
  }

  async function handleApproveSupplier(productId, retailPrice, stock) {
    setPending(true)
    setMessage('')
    try {
      await adminRequest(`cj/products/${encodeURIComponent(productId)}/approve`, { method: 'POST', body: JSON.stringify({ retailPrice, stock }) })
      await loadDashboard()
      setMessage('CJ product approved and published with the Morrow House price and stock you entered.')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The CJ product could not be approved.')
    } finally {
      setPending(false)
    }
  }

  async function handleApproveAllSupplier() {
    setPending(true)
    setMessage('')
    try {
      await adminRequest('cj/products/approve-all', { method: 'POST' })
      await loadDashboard()
      setMessage('All CJ products in the review queue were approved.')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The CJ batch could not be approved.')
    } finally {
      setPending(false)
    }
  }

  async function handleImportSupplier(productId) {
    setPending(true)
    setMessage('')
    try {
      await adminRequest('cj/products/import', { method: 'POST', body: JSON.stringify({ productId }) })
      await loadDashboard()
      setMessage('CJ product imported into the review queue.')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The CJ product could not be imported.')
    } finally {
      setPending(false)
    }
  }

  async function handleSearchSupplier(query) {
    return adminRequest('cj/products/search', { method: 'POST', body: JSON.stringify({ query }) })
  }

  async function logout() {
    try { await adminRequest('logout', { method: 'POST' }) } finally {
      setAuthenticated(false)
      setData(null)
      setMessage('')
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="admin-app">
        {checkingSession ? <main className="admin-loading"><CircleNotch className="spin" size={22} /><span>Checking this private workspace…</span></main> : authenticated && data ? <Dashboard data={data} onReload={loadDashboard} onLogout={logout} onUpdateStock={(id, stock) => updateRecord(`products/${encodeURIComponent(id)}`, { stock }, 'Stock level updated in this preview.')} onUpdateOrder={(id, status) => updateRecord(`orders/${encodeURIComponent(id)}`, { status }, 'Order status updated in this preview.')} onApproveSupplier={handleApproveSupplier} onApproveAllSupplier={handleApproveAllSupplier} onImportSupplier={handleImportSupplier} onSearchSupplier={handleSearchSupplier} message={message || loadError} pending={pending} /> : <AnimatePresence mode="wait"><motion.div key="login" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><LoginPage onLogin={loadDashboard} /></motion.div></AnimatePresence>}
      </div>
    </MotionConfig>
  )
}
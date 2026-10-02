import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const categories = ['All', 'Fiction', 'Business', 'Design', 'Self Growth', 'Science']
const fallbackBooks = [
  {
    id: 1,
    title: 'Atomic Habits',
    author: 'James Clear',
    category: 'Self Growth',
    rating: 4.9,
    price: 18,
    badge: 'Bestseller',
    release: 2024,
    coverGradient: 'linear-gradient(135deg, #fbbf24, #f97316)',
    shortTitle: 'AH',
    description: 'An actionable framework for turning tiny habits into life-changing systems.',
  },
  {
    id: 2,
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    category: 'Business',
    rating: 4.8,
    price: 22,
    badge: 'Popular',
    release: 2023,
    coverGradient: 'linear-gradient(135deg, #60a5fa, #2563eb)',
    shortTitle: 'PM',
    description: 'A timeless guide to how behavior and mindset shape wealth over decades.',
  },
  {
    id: 3,
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    category: 'Design',
    rating: 4.7,
    price: 26,
    badge: 'Classic',
    release: 2022,
    coverGradient: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
    shortTitle: 'DE',
    description: 'A foundational read on human-centered design and intuitive product thinking.',
  },
  {
    id: 4,
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    category: 'Fiction',
    rating: 5,
    price: 20,
    badge: 'New',
    release: 2024,
    coverGradient: 'linear-gradient(135deg, #34d399, #059669)',
    shortTitle: 'PH',
    description: 'A thrilling, heartfelt science-fiction story about survival and discovery.',
  },
  {
    id: 5,
    title: 'Deep Work',
    author: 'Cal Newport',
    category: 'Self Growth',
    rating: 4.8,
    price: 19,
    badge: 'Focus',
    release: 2021,
    coverGradient: 'linear-gradient(135deg, #fb7185, #e11d48)',
    shortTitle: 'DW',
    description: 'Learn how to sharpen focus and do your best work in a distracted world.',
  },
  {
    id: 6,
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    category: 'Science',
    rating: 4.9,
    price: 24,
    badge: 'Featured',
    release: 2024,
    coverGradient: 'linear-gradient(135deg, #38bdf8, #0f172a)',
    shortTitle: 'BH',
    description: 'A dazzling, accessible look at black holes, time, and the universe itself.',
  },
]

const formatPrice = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

function App() {
  const [books, setBooks] = useState(fallbackBooks)
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('featured')
  const [wishlist, setWishlist] = useState(() => {
    try {
      const saved = localStorage.getItem('bookstore-wishlist')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [selectedBook, setSelectedBook] = useState(fallbackBooks[1])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('bookstore-cart')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('bookstore-user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [activePage, setActivePage] = useState(() =>
    user?.role === 'admin' || user?.role === 'manager' ? 'overview' : 'store',
  )
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem('bookstore-token') || ''
    } catch {
      return ''
    }
  })
  const [authMessage, setAuthMessage] = useState('')
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [orders, setOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('bookstore-orders')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [roleOverview, setRoleOverview] = useState(null)
  const [managerOrders, setManagerOrders] = useState([])
  const [roleUsers, setRoleUsers] = useState([])
  const [profileDraft, setProfileDraft] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })
  const [actionMessage, setActionMessage] = useState('')
  const [newBook, setNewBook] = useState({
    title: '',
    author: '',
    category: '',
    price: '',
    stock: '',
    description: '',
  })
  const [reviewText, setReviewText] = useState('')
  const [reviewRating, setReviewRating] = useState('5')
  const [bookReviews, setBookReviews] = useState([])
  const isAdmin = user?.role === 'admin'
  const isManager = user?.role === 'manager' || isAdmin
  const currentUserId = user?.id

  const apiFetch = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (response.status === 401) {
        setToken('')
        setUser(null)
        setOrders([])
        setWishlist(new Set())
        setActivePage('store')
      }
      throw new Error(data.message || `Request failed (${response.status})`)
    }
    return data
  }, [token])

  useEffect(() => {
    fetch('/api/books')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch books')
        }
        return response.json()
      })
      .then((data) => {
        setBooks(data)
        setSelectedBook((current) => current || data[1] || data[0])
      })
      .catch(() => {
        setBooks(fallbackBooks)
        setSelectedBook(fallbackBooks[1])
      })
  }, [])

  useEffect(() => {
    if (user) {
      localStorage.setItem('bookstore-user', JSON.stringify(user))
    } else {
      localStorage.removeItem('bookstore-user')
    }
  }, [user])

  useEffect(() => {
    if (token) {
      localStorage.setItem('bookstore-token', token)
    } else {
      localStorage.removeItem('bookstore-token')
    }
  }, [token])

  useEffect(() => {
    if (!currentUserId || !token) {
      return
    }

    const syncOrders = async () => {
      try {
        const data = await apiFetch('/api/orders')
        const hydratedOrders = data.map((order) => ({
              id: order.id,
              createdAt: order.createdAt,
              total: order.total,
              status: order.status,
              paymentMode: order.paymentMode,
              canCancel: order.canCancel,
              itemCount: order.itemCount,
              items: order.items.map((item) => ({
                title: item.title || books.find((book) => book.id === Number(item.id))?.title || 'Book',
                quantity: Number(item.quantity || 0),
              })),
            }))
        setOrders(hydratedOrders)
      } catch {
        // Keep any local order history if the backend is unavailable.
      }
    }

    const syncProfileAndWishlist = async () => {
      try {
        const [profile, savedWishlist] = await Promise.all([
          apiFetch('/api/profile'),
          apiFetch('/api/me/wishlist'),
        ])
        setUser(profile)
        setProfileDraft({ name: profile.name, email: profile.email })
        setWishlist(new Set(savedWishlist))
      } catch {
        // Keep the cached identity and wishlist when the API is unavailable.
      }
    }

    const loadRoleOverview = async () => {
      if (!isManager && !isAdmin) {
        return
      }

      try {
        if (isAdmin) {
          const [stats, users, allOrders] = await Promise.all([
            apiFetch('/api/admin/stats'),
            apiFetch('/api/admin/users'),
            apiFetch('/api/manager/orders'),
          ])
          setRoleOverview(stats)
          setRoleUsers(users)
          setManagerOrders(allOrders)
        } else {
          setManagerOrders(await apiFetch('/api/manager/orders'))
          setRoleOverview(null)
        }
      } catch {
        setRoleOverview(null)
      }
    }

    syncOrders()
    syncProfileAndWishlist()
    loadRoleOverview()
  }, [token, currentUserId, books, isAdmin, isManager, apiFetch])

  useEffect(() => {
    localStorage.setItem('bookstore-cart', JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    localStorage.setItem('bookstore-wishlist', JSON.stringify([...wishlist]))
  }, [wishlist])

  useEffect(() => {
    localStorage.setItem('bookstore-orders', JSON.stringify(orders))
  }, [orders])

  const cartItems = useMemo(
    () =>
      cart
        .map((item) => {
          const book = books.find((entry) => entry.id === item.id)
          return book ? { ...book, quantity: item.quantity } : null
        })
        .filter(Boolean),
    [cart, books],
  )

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const shipping = subtotal > 0 ? 8 : 0
  const total = subtotal + shipping

  const filteredBooks = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()
    let result = books.filter((book) => {
      const categoryMatch = activeCategory === 'All' || book.category === activeCategory
      const textMatch =
        !searchTerm ||
        `${book.title} ${book.author} ${book.category} ${book.description}`
          .toLowerCase()
          .includes(searchTerm)

      return categoryMatch && textMatch
    })

    if (sortBy === 'price-low') {
      result = [...result].sort((a, b) => a.price - b.price)
    }

    if (sortBy === 'rating') {
      result = [...result].sort((a, b) => b.rating - a.rating)
    }

    if (sortBy === 'newest') {
      result = [...result].sort((a, b) => b.release - a.release)
    }

    return result
  }, [activeCategory, books, search, sortBy])
  const availableCategories = useMemo(
    () => ['All', ...new Set([...categories.slice(1), ...books.map((book) => book.category)])],
    [books],
  )

  const toggleWishlist = (bookId) => {
    setWishlist((current) => {
      const updated = new Set(current)
      if (updated.has(bookId)) {
        updated.delete(bookId)
      } else {
        updated.add(bookId)
      }
      return updated
    })

    if (token) {
      apiFetch(`/api/me/wishlist/${bookId}`, { method: 'PUT' })
        .then((savedWishlist) => setWishlist(new Set(savedWishlist)))
        .catch((error) => setActionMessage(error.message))
    }
  }

  const addToCart = (book) => {
    setSelectedBook(book)
    setCart((current) => {
      const match = current.find((item) => item.id === book.id)
      if (match) {
        return current.map((item) =>
          item.id === book.id ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }

      return [...current, { id: book.id, quantity: 1 }]
    })
    setIsCartOpen(true)
  }

  const updateQuantity = (bookId, delta) => {
    setCart((current) =>
      current
        .map((item) =>
          item.id === bookId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  const refreshBooks = async () => {
    const freshBooks = await fetch('/api/books').then((response) => {
      if (!response.ok) throw new Error('Unable to refresh catalog')
      return response.json()
    })
    setBooks(freshBooks)
    setSelectedBook((selected) => freshBooks.find((book) => book.id === selected.id) || freshBooks[0])
  }

  const refreshOrders = async () => {
    const data = await apiFetch('/api/orders')
    setOrders(data.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        title: item.title || books.find((book) => book.id === Number(item.id))?.title || 'Book',
        quantity: Number(item.quantity || 0),
      })),
    })))
    if (isManager) setManagerOrders(await apiFetch('/api/manager/orders'))
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    try {
      const data = await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileDraft),
      })
      setUser(data.user)
      setActionMessage('Profile updated.')
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const cancelOrder = async (orderId) => {
    try {
      await apiFetch(`/api/orders/${orderId}/cancel`, { method: 'PATCH' })
      await refreshOrders()
      setActionMessage('Order cancelled.')
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const updateOrderStatus = async (orderId, status) => {
    try {
      await apiFetch(`/api/manager/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await refreshOrders()
      setActionMessage(`Order marked ${status}.`)
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const createBook = async (event) => {
    event.preventDefault()
    try {
      await apiFetch('/api/manager/books', {
        method: 'POST',
        body: JSON.stringify(newBook),
      })
      setNewBook({ title: '', author: '', category: '', price: '', stock: '', description: '' })
      await refreshBooks()
      setActionMessage('Book added to the catalog.')
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const changeStock = async (book, adjustment) => {
    try {
      await apiFetch(`/api/manager/books/${book.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: Math.max(0, Number(book.stock || 0) + adjustment) }),
      })
      await refreshBooks()
      setActionMessage(`${book.title} inventory updated.`)
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const changePrice = async (book, price) => {
    if (!Number.isFinite(price) || price <= 0 || price === book.price) return
    try {
      await apiFetch(`/api/manager/books/${book.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ price }),
      })
      await refreshBooks()
      setActionMessage(`${book.title} price updated.`)
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const deleteBook = async (book) => {
    try {
      await apiFetch(`/api/manager/books/${book.id}`, { method: 'DELETE' })
      await refreshBooks()
      setActionMessage(`${book.title} removed from catalog.`)
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const updateUserAccess = async (account, changes) => {
    try {
      const data = await apiFetch(`/api/admin/users/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })
      setRoleUsers((current) => current.map((entry) => entry.id === account.id ? data.user : entry))
      setActionMessage('User access updated.')
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  useEffect(() => {
    fetch(`/api/reviews?bookId=${selectedBook.id}`)
      .then((response) => response.json())
      .then(setBookReviews)
      .catch(() => setBookReviews([]))
  }, [selectedBook.id])

  const submitReview = async (event) => {
    event.preventDefault()
    try {
      if (!user || !token) throw new Error('Sign in to submit a review.')
      const result = await apiFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          bookId: selectedBook.id,
          rating: Number(reviewRating),
          text: reviewText,
        }),
      })
      setBookReviews(result.reviews)
      setReviewText('')
      setActionMessage('Your review was saved.')
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const removeReview = async (review) => {
    try {
      await apiFetch(`/api/reviews/${review.id}`, { method: 'DELETE' })
      setBookReviews((current) => current.filter((entry) => entry.id !== review.id))
      setActionMessage('Review removed.')
    } catch (error) {
      setActionMessage(error.message)
    }
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthMessage('')

    try {
      const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const payload = authMode === 'register'
        ? { name: authForm.name, email: authForm.email, password: authForm.password }
        : { email: authForm.email, password: authForm.password }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed')
      }

      setUser(data.user)
      setProfileDraft({ name: data.user.name, email: data.user.email })
      setOrders([])
      setToken(data.token)
      setActivePage(data.user.role === 'admin' || data.user.role === 'manager' ? 'overview' : 'store')
      setIsAuthOpen(false)
      setAuthForm({ name: '', email: '', password: '' })
    } catch (error) {
      setAuthMessage(error.message)
    }
  }

  const handleCheckout = async () => {
    if (!user || !token) {
      setIsAuthOpen(true)
      setAuthMode('login')
      return
    }

    try {
      const data = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cartItems.map((item) => ({ id: item.id, quantity: item.quantity })),
        }),
      })

      const orderEntry = {
        id: data.order?.id ?? Date.now(),
        createdAt: data.order?.createdAt ?? new Date().toISOString(),
        total: data.order?.total ?? total,
        status: data.order?.status || 'processing',
        paymentMode: data.order?.paymentMode || 'test',
        canCancel: true,
        itemCount: cartCount,
        items: cartItems.map((item) => ({ title: item.title, quantity: item.quantity })),
      }

      setOrders((current) => [orderEntry, ...current].slice(0, 3))
      if (isManager) setManagerOrders(await apiFetch('/api/manager/orders'))
      setCart([])
      setCheckoutMessage('Test order placed. No payment was processed.')
      setIsCartOpen(false)
    } catch (error) {
      setCheckoutMessage(error.message)
    }
  }

  const handleSignOut = () => {
    setUser(null)
    setToken('')
    setAuthMessage('')
    setCheckoutMessage('')
    setActionMessage('')
    setOrders([])
    setWishlist(new Set())
    setCart([])
    setRoleOverview(null)
    setManagerOrders([])
    setRoleUsers([])
    setActivePage('store')
    setIsAuthOpen(false)
  }

  return (
    <div className="page-shell" data-role={user?.role || 'guest'} data-page={activePage}>
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">B</div>
          <div>
            <span className="brand-name">Bookstore</span>
            <small>{isManager ? `${user.role} workspace` : user ? `Hi, ${user.name.split(' ')[0]}` : 'Curated reading'}</small>
          </div>
        </div>

        <nav className={`nav-links ${user ? 'role-nav' : ''}`} aria-label="Main navigation">
          {isManager ? (
            <>
              {[
                ['overview', 'Overview'],
                ['catalog', 'Catalog'],
                ['orders', 'Orders'],
                ...(isAdmin ? [['users', 'Users']] : []),
                ['reviews', 'Reviews'],
                ['account', 'Account'],
                ['store', 'Storefront'],
              ].map(([page, label]) => (
                <button key={page} type="button" className={activePage === page ? 'nav-tab active' : 'nav-tab'} onClick={() => setActivePage(page)}>
                  {label}
                  {page === 'orders' && managerOrders.some((order) => order.status === 'processing') && <span className="nav-count">{managerOrders.filter((order) => order.status === 'processing').length}</span>}
                </button>
              ))}
            </>
          ) : user ? (
            <>
              <button type="button" className={activePage === 'store' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActivePage('store')}>Discover</button>
              <button type="button" className={activePage === 'orders' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActivePage('orders')}>My orders</button>
              <button type="button" className={activePage === 'account' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActivePage('account')}>My account</button>
            </>
          ) : (
            <>
              <a href="#catalog">Catalog</a>
              <a href="#features">Why us</a>
              <a href="#community">Community</a>
              <a href="#journal">Journal</a>
            </>
          )}
        </nav>

        <div className="header-actions">
          {user ? (
            <button type="button" className="ghost-button" onClick={handleSignOut}>
              Sign out
            </button>
          ) : (
            <button type="button" className="ghost-button" onClick={() => setIsAuthOpen(true)}>
              Sign in
            </button>
          )}
          {!isManager && <button type="button" className="cart-button" onClick={() => setIsCartOpen((open) => !open)}>
            Cart <span>{cartCount}</span>
          </button>}
        </div>
      </header>

      <main className="main-content">
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow">Curated for curious minds</span>
            <h1>Read better, live deeper.</h1>
            <p>
              Discover standout books, practical ideas, and beautifully crafted stories for
              your next obsession.
            </p>

            <div className="cta-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Explore library
              </button>
              <button type="button" className="secondary-button" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                Our point of view
              </button>
            </div>

            <div className="stats-grid">
              <div>
                <strong>{books.length}</strong>
                <span>curated titles</span>
              </div>
              <div>
                <strong>{availableCategories.length - 1}</strong>
                <span>genres to explore</span>
              </div>
              <div>
                <strong>Test mode</strong>
                <span>no payment collected</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="floating-badge top-badge">A thoughtful place to start</div>

            <div className="book-preview" style={{ '--cover-gradient': selectedBook.coverGradient }}>
              <div className="book-cover">
                <span>{selectedBook.shortTitle}</span>
              </div>

              <div className="book-summary">
                <div>
                  <small>{selectedBook.category}</small>
                  <h2>{selectedBook.title}</h2>
                </div>
                <div className="summary-row">
                  <span>⭐ {selectedBook.rating}</span>
                  <strong>{formatPrice(selectedBook.price)}</strong>
                </div>
              </div>
            </div>

            <div className="floating-badge bottom-badge">Selected for curious minds</div>
          </div>
        </section>

        <section id="catalog" className="catalog-section">
          <div className="section-header">
            <div>
              <span className="eyebrow dark">The reading room</span>
              <h3>A few good places to begin</h3>
            </div>

            <div className="toolbar">
              <label className="search-field">
                <span>⌕</span>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search titles or authors"
                  aria-label="Search books"
                />
              </label>

              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="featured">Featured</option>
                <option value="rating">Top rated</option>
                <option value="price-low">Price: low to high</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>

          <div className="category-row">
            {availableCategories.map((category) => (
              <button
                type="button"
                key={category}
                className={category === activeCategory ? 'chip active' : 'chip'}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {filteredBooks.length === 0 ? (
            <div className="empty-state">
              <span className="eyebrow dark">No matches</span>
              <h4>We couldn’t find that title.</h4>
              <p>Try another search or choose a different category.</p>
              <button type="button" className="small-action" onClick={() => { setSearch(''); setActiveCategory('All') }}>Clear filters</button>
            </div>
          ) : <div className="book-grid">
            {filteredBooks.map((book) => {
              const isSaved = wishlist.has(book.id)

              return (
                <article
                  key={book.id}
                  className={selectedBook.id === book.id ? 'book-card active' : 'book-card'}
                  onClick={() => setSelectedBook(book)}
                >
                  <div className="book-cover tile" style={{ '--cover-gradient': book.coverGradient }}>
                    <span>{book.shortTitle}</span>
                    <button
                      type="button"
                      className={isSaved ? 'save-button saved' : 'save-button'}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleWishlist(book.id)
                      }}
                      aria-label={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
                    >
                      {isSaved ? '♥' : '♡'}
                    </button>
                  </div>

                  <div className="card-content">
                    <div className="meta-row">
                      <span className="badge">{book.category}</span>
                      <span>⭐ {book.rating}</span>
                    </div>

                    <h4>{book.title}</h4>
                    <p>{book.author}</p>
                    {book.stock !== undefined && <small className="stock-note">{book.stock > 0 ? `${book.stock} in stock` : 'Out of stock'}</small>}
                    <div className="card-bottom">
                      <strong>{formatPrice(book.price)}</strong>
                      <button
                        type="button"
                        className="mini-button"
                        disabled={book.stock === 0}
                        onClick={(event) => {
                          event.stopPropagation()
                          addToCart(book)
                        }}
                      >
                        {book.stock === 0 ? 'Out of stock' : 'Add to cart'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>}

          <section className="reader-tools">
            <div className="feature-heading">
              <span className="eyebrow dark">Reader reviews</span>
              <h3>{selectedBook.title}</h3>
            </div>
            <div className="review-list">
              {bookReviews.length === 0 && <p>No reviews yet. Be the first to share your thoughts.</p>}
              {bookReviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <div>
                    <strong>{review.user}</strong>
                    <span>{'★'.repeat(review.rating)}</span>
                    {isManager && <button className="small-action danger-action" type="button" onClick={() => removeReview(review)}>Remove review</button>}
                  </div>
                  <p>{review.text}</p>
                </article>
              ))}
            </div>
            <form className="action-form review-form" onSubmit={submitReview}>
              <label>
                Rating
                <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)}>
                  {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
                </select>
              </label>
              <label className="wide-field">
                Your review
                <textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} minLength="5" maxLength="1000" required placeholder="What did you think of this book?" />
              </label>
              <button className="primary-button" type="submit">Publish review</button>
            </form>
          </section>
        </section>

        <section id="features" className="features-section">
          <div className="feature-heading">
            <span className="eyebrow dark">A considered collection</span>
            <h3>A calmer way to find your next read</h3>
          </div>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">01</div>
              <h4>Browse your way</h4>
              <p>Search by title or author, then narrow the shelf by genre and rating.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">02</div>
              <h4>Details that matter</h4>
              <p>See descriptions, prices, availability, and reader reviews before you choose.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">03</div>
              <h4>Your own reading list</h4>
              <p>Save titles for later, keep your picks in one place, and come back when you are ready.</p>
            </div>
          </div>
        </section>

        <section id="community" className="community-section">
          <div className="community-copy">
            <span className="eyebrow dark">A little more intention</span>
            <h3>Less scrolling. More getting lost in a good book.</h3>
            <p>
              Find a small, considered shelf of stories and ideas. Browse at your own pace,
              save what speaks to you, and share an honest review when you are ready.
            </p>
          </div>

          <div className="insight-panel">
            <div>
              <small>Start with</small>
              <strong>Curiosity</strong>
            </div>
            <div>
              <small>Checkout</small>
              <strong>Test only</strong>
            </div>
            <div>
              <small>Made for</small>
              <strong>Readers</strong>
            </div>
          </div>
        </section>

        {user && (
          <section className="role-workspace">
            <div className="workspace-page-header">
              <span className="eyebrow dark">{user.role} workspace</span>
              <div className="workspace-heading-row">
                <div>
                  <h3>{isManager
                    ? ({ overview: 'Store overview', catalog: 'Catalog & inventory', orders: 'Order fulfillment', users: 'User access', reviews: 'Review moderation', account: 'Account settings' }[activePage] || 'Store operations')
                    : activePage === 'orders' ? 'Your orders' : activePage === 'account' ? 'Your account' : 'Your reader account'}</h3>
                  <p className="workspace-description">{isManager
                    ? 'A focused workspace for keeping the bookstore running smoothly.'
                    : 'Manage your reading list, profile, and purchases in one place.'}</p>
                </div>
                {isManager && <span className="role-badge">{isAdmin ? 'Administrator' : 'Store manager'}</span>}
              </div>
            </div>
            {actionMessage && <p className="action-message" role="status">{actionMessage}</p>}

            <form className="action-form profile-form workspace-profile" onSubmit={saveProfile}>
              <label>Name<input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>Email<input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} required /></label>
              <button className="primary-button" type="submit">Save profile</button>
            </form>

            {!isManager && (
              <div className="workspace-panel workspace-wishlist">
                <h4>Your saved books</h4>
                <div className="management-list">
                  {[...wishlist].map((bookId) => books.find((book) => book.id === bookId)).filter(Boolean).map((book) => (
                    <div className="management-row" key={book.id}>
                      <div><strong>{book.title}</strong><small>{book.author} · {formatPrice(book.price)}</small></div>
                      <div className="row-actions">
                        <button className="small-action" type="button" onClick={() => addToCart(book)}>Add to cart</button>
                        <button className="small-action danger-action" type="button" onClick={() => toggleWishlist(book.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {wishlist.size === 0 && <p>Your wishlist is empty. Save books from the catalog to see them here.</p>}
                </div>
              </div>
            )}

            {isManager && (
              <>
                {activePage === 'overview' && !isAdmin && (
                  <div className="insight-panel admin-metrics workspace-metrics">
                    <div><small>Orders</small><strong>{managerOrders.length}</strong></div>
                    <div><small>To process</small><strong>{managerOrders.filter((order) => order.status === 'processing').length}</strong></div>
                    <div><small>Catalog titles</small><strong>{books.length}</strong></div>
                    <div><small>Inventory units</small><strong>{books.reduce((sum, book) => sum + Number(book.stock || 0), 0)}</strong></div>
                  </div>
                )}

                {activePage === 'overview' && isAdmin && roleOverview && (
                  <div className="insight-panel admin-metrics workspace-metrics">
                    <div><small>Users</small><strong>{roleOverview.totalUsers}</strong></div>
                    <div><small>Orders</small><strong>{roleOverview.totalOrders}</strong></div>
                    <div><small>Test order value · no charges</small><strong>{formatPrice(roleOverview.testOrderValue)}</strong></div>
                    <div><small>Customer accounts</small><strong>{roleOverview.userRoles?.customer || 0}</strong></div>
                  </div>
                )}

                {activePage === 'catalog' && <div className="workspace-columns workspace-catalog">
                  <div className="workspace-panel workspace-book-form">
                    <h4>Add a book</h4>
                    <form className="action-form" onSubmit={createBook}>
                      {['title', 'author', 'category', 'price', 'stock', 'description'].map((field) => (
                        <label key={field} className={field === 'description' ? 'wide-field' : ''}>
                          {field === 'price' ? 'Price ($)' : field === 'stock' ? 'Stock' : field[0].toUpperCase() + field.slice(1)}
                          <input
                            type={['price', 'stock'].includes(field) ? 'number' : 'text'}
                            min={['price', 'stock'].includes(field) ? (field === 'price' ? '0.01' : '0') : undefined}
                            step={field === 'price' ? '0.01' : '1'}
                            required={field !== 'description'}
                            value={newBook[field]}
                            onChange={(event) => setNewBook((current) => ({ ...current, [field]: event.target.value }))}
                          />
                        </label>
                      ))}
                      <button className="primary-button" type="submit">Add to catalog</button>
                    </form>
                  </div>
                  <div className="workspace-panel workspace-inventory">
                    <h4>Inventory and catalog</h4>
                    <div className="management-list">
                      {books.map((book) => (
                        <div className="management-row" key={book.id}>
                          <div>
                            <strong>{book.title}</strong>
                            <small>Stock {book.stock ?? '—'}</small>
                          </div>
                          <div className="row-actions">
                            <label className="price-edit">Price
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                defaultValue={book.price}
                                onBlur={(event) => changePrice(book, Number(event.target.value))}
                                aria-label={`Price for ${book.title}`}
                              />
                            </label>
                            <button className="small-action" type="button" onClick={() => changeStock(book, -1)}>− stock</button>
                            <button className="small-action" type="button" onClick={() => changeStock(book, 1)}>+ stock</button>
                            <button className="small-action danger-action" type="button" onClick={() => deleteBook(book)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>}

                {(activePage === 'overview' || activePage === 'orders') && <div className="workspace-panel workspace-orders">
                  <h4>Order fulfillment</h4>
                  <div className="management-list">
                    {managerOrders.length === 0 && <p>No orders to process.</p>}
                    {managerOrders.slice(0, activePage === 'overview' ? 5 : undefined).map((order) => (
                      <div className="management-row order-management-row" key={order.id}>
                        <div>
                          <strong>{order.user} · {formatPrice(order.total)}</strong>
                          <small>{order.email} · {order.itemCount} items · {new Date(order.createdAt).toLocaleDateString()}</small>
                        </div>
                        <div className="row-actions">
                          <span className="status-pill">{order.status}</span>
                          <select value={order.status} onChange={(event) => updateOrderStatus(order.id, event.target.value)} aria-label={`Update order ${order.id} status`}>
                            {['processing', 'packed', 'shipped', 'delivered', 'cancelled'].map((status) => <option key={status}>{status}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>}

                {isAdmin && activePage === 'users' && (
                  <div className="workspace-panel workspace-users">
                    <h4>User access management</h4>
                    <div className="management-list">
                      {roleUsers.map((account) => (
                        <div className="management-row" key={account.id}>
                          <div><strong>{account.name}</strong><small>{account.email} · {account.isActive ? 'Active' : 'Suspended'}</small></div>
                          <div className="row-actions">
                            <select value={account.role} disabled={account.id === user.id} onChange={(event) => updateUserAccess(account, { role: event.target.value })} aria-label={`Change ${account.name}'s role`}>
                              {['customer', 'manager', 'admin'].map((role) => <option key={role}>{role}</option>)}
                            </select>
                            {account.id !== user.id && <button className="small-action" type="button" onClick={() => updateUserAccess(account, { isActive: !account.isActive })}>{account.isActive ? 'Suspend' : 'Reactivate'}</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <section id="journal" className="newsletter-section">
          <div>
            <span className="eyebrow dark">Make room for a new favorite</span>
            <h3>Your next great read is on the shelf.</h3>
            <p>Take a look around. You might find exactly the story you needed.</p>
          </div>

          <button type="button" className="primary-button" onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}>
            Browse the collection
          </button>
        </section>

        {user && activePage === 'orders' && !isManager && (
          <section className="orders-section">
            <div className="feature-heading">
              <span className="eyebrow dark">Order history</span>
              <h3>Your purchases</h3>
            </div>

            <div className="order-list">
              {orders.length === 0 && <p>You have no orders yet. Browse the catalog to find your next read.</p>}
              {orders.map((order) => (
                <div key={order.id} className="order-card">
                  <div>
                    <small>{new Date(order.createdAt).toLocaleDateString()}</small>
                    <strong>{order.itemCount} books</strong>
                  </div>
                  <div className="order-items">
                    {order.items.map((item) => (
                      <span key={`${order.id}-${item.title}`}>
                        {item.title} × {item.quantity}
                      </span>
                    ))}
                  </div>
                  <div className="order-total-actions">
                    <strong>{formatPrice(order.total)}</strong>
                    <span className="status-pill">{order.status || 'processing'}</span>
                      {order.paymentMode === 'test' && <small className="test-order-note">Test order · no payment processed</small>}
                    {order.canCancel && <button className="small-action danger-action" type="button" onClick={() => cancelOrder(order.id)}>Cancel order</button>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {!isManager && <aside className={isCartOpen ? 'cart-drawer open' : 'cart-drawer'}>
        <div className="cart-header">
          <div>
            <span className="eyebrow dark">Your cart</span>
            <h3>{cartCount} items</h3>
          </div>
          <button type="button" className="close-cart" onClick={() => setIsCartOpen(false)}>
            ×
          </button>
        </div>

        {checkoutMessage && <p className="success-text checkout-message">{checkoutMessage}</p>}

        {cartItems.length === 0 ? (
          <div className="empty-cart">
            <p>Your cart is empty.</p>
            <button type="button" className="primary-button" onClick={() => setIsCartOpen(false)}>
              Continue shopping
            </button>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {cartItems.map((item) => (
                <div key={item.id} className="cart-item">
                  <div className="mini-cover" style={{ '--cover-gradient': item.coverGradient }}>
                    <span>{item.shortTitle}</span>
                  </div>

                  <div className="item-copy">
                    <strong>{item.title}</strong>
                    <span>{item.author}</span>
                    <div className="quantity-row">
                      <button type="button" onClick={() => updateQuantity(item.id, -1)}>
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.id, 1)}>
                        +
                      </button>
                    </div>
                  </div>

                  <span className="item-price">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="totals-box">
              <div>
                <span>Subtotal</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>
              <div>
                <span>Shipping</span>
                <strong>{formatPrice(shipping)}</strong>
              </div>
              <div className="total-line">
                <span>Total</span>
                <strong>{formatPrice(total)}</strong>
              </div>
            </div>

            <p className="test-payment-note">Test mode: placing this order will not charge you or process a real payment.</p>
            <button type="button" className="primary-button checkout-button" onClick={handleCheckout}>
              Place test order
            </button>
          </>
        )}
      </aside>}

      {isAuthOpen && (
        <div className="modal-backdrop" onClick={() => setIsAuthOpen(false)}>
          <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <div className="auth-header">
              <div>
                <span className="eyebrow dark">Member access</span>
                <h3>{authMode === 'login' ? 'Welcome back' : 'Create account'}</h3>
              </div>
              <button type="button" className="close-cart" onClick={() => setIsAuthOpen(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authMode === 'register' && (
                <label>
                  Full name
                  <input
                    value={authForm.name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Jane Reader"
                  />
                </label>
              )}

              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="you@example.com"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Enter password"
                  minLength={authMode === 'register' ? 12 : undefined}
                  maxLength={128}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                />
              </label>
              {authMode === 'register' && <p className="auth-hint">Use at least 12 characters for your password.</p>}

              {authMessage && <p className="auth-message">{authMessage}</p>}

              <button type="submit" className="primary-button full-width">
                {authMode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <button
              type="button"
              className="switch-mode"
              onClick={() => setAuthMode((mode) => (mode === 'login' ? 'register' : 'login'))}
            >
              {authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      )}

      <footer className="footer">
        <span>Bookstore</span>
        <div>
          <a href="#catalog">Catalog</a>
          <a href="#features">Features</a>
          <a href="#community">Community</a>
        </div>
      </footer>
    </div>
  )
}

export default App

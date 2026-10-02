import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, transaction } from './db.js'

const app = express()
const port = Number(process.env.PORT || 4000)
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jwtSecret = process.env.JWT_SECRET
const paymentMode = process.env.PAYMENT_MODE || 'test'
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5175')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (!jwtSecret || jwtSecret.length < 32 || /replace-with|bookstore-secret-2026/i.test(jwtSecret)) {
  throw new Error('Set JWT_SECRET to a unique random value of at least 32 characters.')
}
if (paymentMode !== 'test') {
  throw new Error('Only PAYMENT_MODE=test is supported until a payment provider is configured.')
}

app.disable('x-powered-by')
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false)
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    const localDevelopmentOrigin = process.env.NODE_ENV !== 'production' &&
      /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '')
    if (!origin || allowedOrigins.includes(origin) || localDevelopmentOrigin) return callback(null, true)
    return callback(new Error('Origin is not allowed by CORS.'))
  },
}))
app.use(express.json({ limit: '32kb' }))
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}))

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Try again in 15 minutes.' },
})

const publicUser = (row) => ({
  id: Number(row.id),
  name: row.name,
  email: row.email,
  role: row.role,
  isActive: row.is_active,
})

const publicBook = (row) => ({
  id: Number(row.id),
  title: row.title,
  author: row.author,
  category: row.category,
  rating: Number(row.rating),
  price: Number(row.price),
  stock: row.stock,
  badge: row.badge,
  release: row.release,
  coverGradient: row.cover_gradient,
  shortTitle: row.short_title,
  description: row.description,
})

const signToken = (user) => jwt.sign({ sub: String(user.id) }, jwtSecret, { expiresIn: '7d' })

const authenticate = async (req, res, next) => {
  const authorization = req.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' })
  }

  try {
    const payload = jwt.verify(authorization.slice(7), jwtSecret)
    const result = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = $1',
      [payload.sub],
    )
    const user = result.rows[0]
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Account is unavailable.' })
    }
    req.user = publicUser(user)
    return next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token.' })
    }
    return next(error)
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions.' })
  }
  return next()
}

const restoreOrderStock = async (client, orderId) => {
  const orderResult = await client.query(
    'SELECT stock_restored, status FROM orders WHERE id = $1 FOR UPDATE',
    [orderId],
  )
  const order = orderResult.rows[0]
  if (!order) return null
  if (!order.stock_restored) {
    await client.query(
      `UPDATE books AS b SET stock = b.stock + oi.quantity
       FROM order_items AS oi WHERE oi.order_id = $1 AND oi.book_id = b.id`,
      [orderId],
    )
    await client.query('UPDATE orders SET stock_restored = TRUE, status = $2 WHERE id = $1', [orderId, 'cancelled'])
  }
  return order
}

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ status: 'ok', message: 'Bookstore API is running.', database: 'connected' })
})

app.get('/api/books', async (_req, res) => {
  const result = await pool.query(
    `SELECT b.* FROM books b ORDER BY b.id`,
  )
  const reviews = await pool.query(
    'SELECT book_id, ROUND(AVG(rating)::numeric, 1) AS average_rating FROM reviews GROUP BY book_id',
  )
  const averages = new Map(reviews.rows.map((row) => [Number(row.book_id), Number(row.average_rating)]))
  res.json(result.rows.map((row) => ({
    ...publicBook(row),
    rating: averages.get(Number(row.id)) ?? Number(row.rating),
  })))
})

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = req.body?.password
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: 'Provide a name, valid email, and password of 12–128 characters.' })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3) RETURNING id, name, email, role, is_active`,
      [name, email, passwordHash],
    )
    const user = publicUser(result.rows[0])
    res.status(201).json({ token: signToken(user), user })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An account with that email already exists.' })
    }
    throw error
  }
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = req.body?.password
  if (!email || typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const result = await pool.query(
    'SELECT id, name, email, role, is_active, password_hash FROM users WHERE email = $1',
    [email],
  )
  const row = result.rows[0]
  if (!row || !row.is_active || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const user = publicUser(row)
  res.json({ token: signToken(user), user })
})

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/profile', authenticate, (req, res) => {
  res.json(req.user)
})

app.patch('/api/profile', authenticate, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'A valid name and email are required.' })
  }

  try {
    const result = await pool.query(
      `UPDATE users SET name = $1, email = $2 WHERE id = $3
       RETURNING id, name, email, role, is_active`,
      [name, email, req.user.id],
    )
    res.json({ user: publicUser(result.rows[0]) })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'That email is already in use.' })
    throw error
  }
})

app.get('/api/me/wishlist', authenticate, async (req, res) => {
  const result = await pool.query('SELECT book_id FROM wishlists WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id])
  res.json(result.rows.map((row) => Number(row.book_id)))
})

app.put('/api/me/wishlist/:bookId', authenticate, async (req, res) => {
  const bookId = Number(req.params.bookId)
  if (!Number.isSafeInteger(bookId)) return res.status(400).json({ message: 'Invalid book ID.' })

  const result = await transaction(async (client) => {
    const book = await client.query('SELECT id FROM books WHERE id = $1', [bookId])
    if (!book.rowCount) return null
    const removed = await client.query('DELETE FROM wishlists WHERE user_id = $1 AND book_id = $2 RETURNING book_id', [req.user.id, bookId])
    if (!removed.rowCount) {
      await client.query('INSERT INTO wishlists (user_id, book_id) VALUES ($1, $2)', [req.user.id, bookId])
    }
    return client.query('SELECT book_id FROM wishlists WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id])
  })
  if (!result) return res.status(404).json({ message: 'Book not found.' })
  res.json(result.rows.map((row) => Number(row.book_id)))
})

app.get('/api/reviews', async (req, res) => {
  const bookId = req.query.bookId ? Number(req.query.bookId) : null
  if (bookId !== null && !Number.isSafeInteger(bookId)) return res.status(400).json({ message: 'Invalid book ID.' })
  const result = await pool.query(
    `SELECT r.id, r.book_id, r.rating, r.text, r.created_at, r.updated_at, u.name AS user
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE ($1::bigint IS NULL OR r.book_id = $1) AND u.is_active = TRUE
     ORDER BY r.created_at DESC`,
    [bookId],
  )
  res.json(result.rows.map((row) => ({
    id: Number(row.id),
    bookId: Number(row.book_id),
    rating: row.rating,
    text: row.text,
    user: row.user,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })))
})

app.post('/api/reviews', authenticate, async (req, res) => {
  const bookId = Number(req.body?.bookId)
  const rating = Number(req.body?.rating)
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!Number.isSafeInteger(bookId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || text.length < 5 || text.length > 1000) {
    return res.status(400).json({ message: 'Provide a book, 1–5 rating, and a 5–1000 character review.' })
  }

  const book = await pool.query('SELECT id FROM books WHERE id = $1', [bookId])
  if (!book.rowCount) return res.status(404).json({ message: 'Book not found.' })
  const saved = await pool.query(
    `INSERT INTO reviews (book_id, user_id, rating, text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (book_id, user_id) DO UPDATE
       SET rating = EXCLUDED.rating, text = EXCLUDED.text, updated_at = NOW()
     RETURNING id, (xmax = 0) AS inserted`,
    [bookId, req.user.id, rating, text],
  )
  const result = await pool.query(
    `SELECT r.id, r.book_id, r.rating, r.text, r.created_at, r.updated_at, u.name AS user
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.book_id = $1 AND u.is_active = TRUE ORDER BY r.created_at DESC`,
    [bookId],
  )
  const status = saved.rows[0].inserted ? 201 : 200
  res.status(status).json({
    reviews: result.rows.map((row) => ({
      id: Number(row.id), bookId: Number(row.book_id), rating: row.rating, text: row.text, user: row.user,
      createdAt: row.created_at, updatedAt: row.updated_at,
    })),
  })
})

app.delete('/api/reviews/:reviewId', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  const result = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [req.params.reviewId])
  if (!result.rowCount) return res.status(404).json({ message: 'Review not found.' })
  res.json({ success: true, review: { id: Number(result.rows[0].id) } })
})

const orderItemsJson = `COALESCE(json_agg(json_build_object(
  'id', oi.book_id, 'title', oi.title_snapshot, 'price', oi.price_snapshot, 'quantity', oi.quantity
) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]'::json)`

app.get('/api/orders', authenticate, async (req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.created_at, o.status, o.total, o.payment_mode,
      COALESCE(SUM(oi.quantity), 0)::int AS item_count, ${orderItemsJson} AS items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.created_at DESC`,
    [req.user.id],
  )
  res.json(result.rows.map((row) => ({
    id: Number(row.id), createdAt: row.created_at, status: row.status, total: Number(row.total), paymentMode: row.payment_mode,
    itemCount: row.item_count, items: row.items, canCancel: ['processing', 'packed'].includes(row.status),
  })))
})

app.patch('/api/orders/:orderId/cancel', authenticate, async (req, res) => {
  const orderId = Number(req.params.orderId)
  const outcome = await transaction(async (client) => {
    const result = await client.query(
      'SELECT id, status, stock_restored FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [orderId, req.user.id],
    )
    const order = result.rows[0]
    if (!order) return { type: 'not-found' }
    if (!['processing', 'packed'].includes(order.status)) return { type: 'conflict' }
    await restoreOrderStock(client, orderId)
    return { type: 'ok' }
  })
  if (outcome.type === 'not-found') return res.status(404).json({ message: 'Order not found.' })
  if (outcome.type === 'conflict') return res.status(409).json({ message: 'This order can no longer be cancelled.' })
  res.json({ success: true, status: 'cancelled' })
})

app.get('/api/manager/orders', authenticate, requireRole('admin', 'manager'), async (_req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.created_at, o.status, o.total, o.payment_mode, u.name AS user, u.email,
      COALESCE(SUM(oi.quantity), 0)::int AS item_count, ${orderItemsJson} AS items
     FROM orders o JOIN users u ON u.id = o.user_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     GROUP BY o.id, u.id ORDER BY o.created_at DESC`,
  )
  res.json(result.rows.map((row) => ({
    id: Number(row.id), createdAt: row.created_at, status: row.status,
    user: row.user, email: row.email, total: Number(row.total), paymentMode: row.payment_mode, itemCount: row.item_count, items: row.items,
  })))
})

app.patch('/api/manager/orders/:orderId/status', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  const orderId = Number(req.params.orderId)
  const { status } = req.body || {}
  const statuses = ['processing', 'packed', 'shipped', 'delivered', 'cancelled']
  if (!Number.isSafeInteger(orderId) || !statuses.includes(status)) return res.status(400).json({ message: 'Invalid order or status.' })

  const outcome = await transaction(async (client) => {
    const result = await client.query('SELECT status, stock_restored FROM orders WHERE id = $1 FOR UPDATE', [orderId])
    const order = result.rows[0]
    if (!order) return { type: 'not-found' }
    if (order.status === 'cancelled' && status !== 'cancelled') return { type: 'conflict' }
    if (status === 'cancelled' && order.status !== 'cancelled') {
      await restoreOrderStock(client, orderId)
    } else {
      await client.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, status])
    }
    return { type: 'ok' }
  })
  if (outcome.type === 'not-found') return res.status(404).json({ message: 'Order not found.' })
  if (outcome.type === 'conflict') return res.status(409).json({ message: 'Cancelled orders cannot be reopened.' })
  res.json({ success: true, order: { id: orderId, status } })
})

app.post('/api/manager/books', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  const { title, author, category, price, stock, description } = req.body || {}
  const normalizedPrice = Number(price)
  const normalizedStock = Number(stock)
  if (typeof title !== 'string' || !title.trim() || typeof author !== 'string' || !author.trim() ||
      typeof category !== 'string' || !category.trim() || !Number.isFinite(normalizedPrice) || normalizedPrice <= 0 ||
      !Number.isInteger(normalizedStock) || normalizedStock < 0) {
    return res.status(400).json({ message: 'Title, author, category, positive price, and non-negative stock are required.' })
  }
  const shortTitle = title.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const result = await pool.query(
    `INSERT INTO books (title, author, category, price, stock, description, rating, badge, release, cover_gradient, short_title)
     VALUES ($1,$2,$3,$4,$5,$6,0,'New',$7,'linear-gradient(135deg, #60a5fa, #2563eb)',$8)
     RETURNING *`,
    [title.trim(), author.trim(), category.trim(), normalizedPrice, normalizedStock, String(description || '').trim(), new Date().getFullYear(), shortTitle],
  )
  res.status(201).json(publicBook(result.rows[0]))
})

app.patch('/api/manager/books/:bookId', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  const bookId = Number(req.params.bookId)
  const allowed = ['title', 'author', 'category', 'price', 'stock', 'description', 'badge']
  const fields = []
  const values = []
  for (const field of allowed) {
    if (req.body?.[field] === undefined) continue
    let value = req.body[field]
    if (['title', 'author', 'category', 'description', 'badge'].includes(field)) {
      if (typeof value !== 'string' || (field !== 'description' && !value.trim())) {
        return res.status(400).json({ message: `Invalid ${field}.` })
      }
      value = value.trim()
    } else {
      value = Number(value)
      if (!Number.isFinite(value) || value < 0 || (field === 'price' && value === 0) ||
          (field === 'stock' && !Number.isInteger(value))) return res.status(400).json({ message: `Invalid ${field}.` })
    }
    values.push(value)
    fields.push(`${({ title: 'title', author: 'author', category: 'category', price: 'price', stock: 'stock', description: 'description', badge: 'badge' })[field]} = $${values.length}`)
  }
  if (!Number.isSafeInteger(bookId)) return res.status(400).json({ message: 'Invalid book ID.' })
  if (!fields.length) return res.status(400).json({ message: 'No book fields were provided.' })
  values.push(bookId)
  const result = await pool.query(`UPDATE books SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
  if (!result.rowCount) return res.status(404).json({ message: 'Book not found.' })
  res.json(publicBook(result.rows[0]))
})

app.delete('/api/manager/books/:bookId', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING id, title', [req.params.bookId])
  if (!result.rowCount) return res.status(404).json({ message: 'Book not found.' })
  res.json({ success: true, book: { id: Number(result.rows[0].id), title: result.rows[0].title } })
})

app.get('/api/admin/stats', authenticate, requireRole('admin'), async (_req, res) => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM users)::int AS total_users,
       (SELECT COUNT(*) FROM orders)::int AS total_orders,
       (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status <> 'cancelled') AS test_order_value,
       (SELECT COUNT(*) FROM orders WHERE status = 'processing')::int AS processing_orders,
       (SELECT COUNT(*) FROM books WHERE stock <= 3)::int AS low_stock_titles`,
  )
  const roles = await pool.query('SELECT role, COUNT(*)::int AS count FROM users GROUP BY role')
  res.json({
    totalUsers: result.rows[0].total_users,
    totalOrders: result.rows[0].total_orders,
    testOrderValue: Number(result.rows[0].test_order_value),
    processingOrders: result.rows[0].processing_orders,
    lowStockTitles: result.rows[0].low_stock_titles,
    userRoles: Object.fromEntries(roles.rows.map((row) => [row.role, row.count])),
  })
})

app.get('/api/admin/users', authenticate, requireRole('admin'), async (_req, res) => {
  const result = await pool.query('SELECT id, name, email, role, is_active FROM users ORDER BY created_at DESC')
  res.json(result.rows.map(publicUser))
})

app.patch('/api/admin/users/:userId', authenticate, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.userId)
  const { role, isActive } = req.body || {}
  if (!Number.isSafeInteger(userId)) return res.status(400).json({ message: 'Invalid user ID.' })
  if (req.user.id === userId && (role !== undefined || isActive === false)) {
    return res.status(400).json({ message: 'You cannot change your own role or deactivate your account.' })
  }
  if (role !== undefined && !['customer', 'manager', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role.' })
  if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be a boolean.' })
  if (role === undefined && isActive === undefined) return res.status(400).json({ message: 'Provide role or isActive.' })

  const result = await transaction(async (client) => {
    const target = await client.query('SELECT id, name, email, role, is_active FROM users WHERE id = $1 FOR UPDATE', [userId])
    if (!target.rowCount) return { type: 'not-found' }
    const user = target.rows[0]
    const demoting = role !== undefined && role !== 'admin' && user.role === 'admin'
    const deactivating = isActive === false && user.is_active
    if (user.role === 'admin' && user.is_active && (demoting || deactivating)) {
      const count = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE role='admin' AND is_active=TRUE`)
      if (count.rows[0].count <= 1) return { type: 'last-admin' }
    }
    const updated = await client.query(
      `UPDATE users SET role = COALESCE($1, role), is_active = COALESCE($2, is_active)
       WHERE id = $3 RETURNING id, name, email, role, is_active`,
      [role ?? null, isActive ?? null, userId],
    )
    return { type: 'ok', user: publicUser(updated.rows[0]) }
  })
  if (result.type === 'not-found') return res.status(404).json({ message: 'User not found.' })
  if (result.type === 'last-admin') return res.status(409).json({ message: 'At least one active administrator must remain.' })
  res.json({ user: result.user })
})

app.post('/api/orders', authenticate, requireRole('customer'), async (req, res) => {
  const items = req.body?.items
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({ message: 'Your order must contain 1–50 items.' })
  }
  const quantities = new Map()
  for (const item of items) {
    const id = Number(item?.id)
    const quantity = Number(item?.quantity)
    if (!Number.isSafeInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ message: 'One or more order items are invalid.' })
    }
    quantities.set(id, (quantities.get(id) || 0) + quantity)
  }

  const order = await transaction(async (client) => {
    const snapshots = []
    for (const [bookId, quantity] of quantities) {
      const result = await client.query(
        `UPDATE books SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING id, title, price`,
        [quantity, bookId],
      )
      if (!result.rowCount) {
        const exists = await client.query('SELECT title FROM books WHERE id = $1', [bookId])
        throw Object.assign(new Error(exists.rowCount ? `${exists.rows[0].title} does not have enough stock.` : 'One or more books are unavailable.'), { statusCode: exists.rowCount ? 409 : 400 })
      }
      snapshots.push({ ...result.rows[0], quantity })
    }
    const subtotal = snapshots.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
    const shipping = 8
    const inserted = await client.query(
      `INSERT INTO orders (user_id, subtotal, shipping, total, payment_mode)
       VALUES ($1, $2, $3, $4, 'test') RETURNING id, created_at, status`,
      [req.user.id, subtotal, shipping, subtotal + shipping],
    )
    const savedOrder = inserted.rows[0]
    for (const item of snapshots) {
      await client.query(
        `INSERT INTO order_items (order_id, book_id, title_snapshot, price_snapshot, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [savedOrder.id, item.id, item.title, item.price, item.quantity],
      )
    }
    return {
      id: Number(savedOrder.id),
      createdAt: savedOrder.created_at,
      status: savedOrder.status,
      items: snapshots.map((item) => ({ id: Number(item.id), quantity: item.quantity })),
      subtotal,
      shipping,
      total: subtotal + shipping,
      paymentMode: 'test',
    }
  })
  res.status(201).json({ success: true, order: { ...order, user: req.user.name } })
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(projectDirectory, 'dist'), { index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    return res.sendFile(path.join(projectDirectory, 'dist', 'index.html'))
  })
}

app.use((error, _req, res, _next) => {
  console.error('API request failed:', error)
  if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
  if (error.code === '23505') return res.status(409).json({ message: 'A record with those details already exists.' })
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' })
  if (error.message === 'Origin is not allowed by CORS.') return res.status(403).json({ message: error.message })
  return res.status(500).json({ message: 'An unexpected server error occurred.' })
})

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = app.listen(port, () => {
    console.log(`Bookstore API listening on port ${port} (payments: test mode)`)
  })

  const shutdown = (signal) => {
    console.log(`${signal} received; shutting down gracefully.`)
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

export default app

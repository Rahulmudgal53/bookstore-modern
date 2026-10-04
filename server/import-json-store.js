import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, transaction } from './db.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = path.join(directory, 'data', 'store.json')
const money = (value) => Number(value || 0)

try {
  const raw = await fs.readFile(sourcePath, 'utf8')
  const store = JSON.parse(raw)
  if (!Array.isArray(store.users) || !Array.isArray(store.books) || !Array.isArray(store.orders)) {
    throw new Error('The JSON store must contain users, books, and orders arrays.')
  }
  const fixtureEmails = new Set([
    'demo@bookstore.com',
    'manager@bookstore.com',
    'admin@bookstore.com',
    'testrole@example.com',
  ])
  const users = store.users.filter((user) => !fixtureEmails.has(String(user.email).toLowerCase()))
  const importedUserIds = new Set(users.map((user) => String(user.id)))
  const orders = store.orders.filter((order) => importedUserIds.has(String(order.userId)))
  const reviews = (store.reviews || []).filter((review) => importedUserIds.has(String(review.userId)))

  await transaction(async (client) => {
    const existing = await client.query('SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM orders) AS count')
    if (Number(existing.rows[0].count) !== 0) {
      throw new Error('The target database already contains users or orders; refusing to import to avoid duplicates.')
    }

    for (const book of store.books) {
      await client.query(
        `INSERT INTO books (id,title,author,category,rating,price,stock,badge,release,cover_gradient,short_title,description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, author=EXCLUDED.author,
         category=EXCLUDED.category, rating=EXCLUDED.rating, price=EXCLUDED.price,
         stock=EXCLUDED.stock, badge=EXCLUDED.badge, release=EXCLUDED.release,
         cover_gradient=EXCLUDED.cover_gradient, short_title=EXCLUDED.short_title,
         description=EXCLUDED.description`,
        [book.id, book.title, book.author, book.category, book.rating || 0, book.price, book.stock || 0,
          book.badge || 'New', book.release || new Date().getFullYear(), book.coverGradient || '',
          book.shortTitle || '', book.description || ''],
      )
    }

    for (const user of users) {
      await client.query(
        `INSERT INTO users (id,name,email,password_hash,role,is_active)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [user.id, user.name, user.email.toLowerCase(), user.passwordHash, user.role || 'customer', user.isActive !== false],
      )
      for (const bookId of user.wishlist || []) {
        await client.query('INSERT INTO wishlists (user_id,book_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.id, bookId])
      }
    }

    for (const order of orders) {
      await client.query(
        `INSERT INTO orders (id,user_id,created_at,status,subtotal,shipping,total,payment_mode,stock_restored)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'test',$8)`,
        [order.id, order.userId, order.createdAt || new Date().toISOString(), order.status || 'processing',
          money(order.subtotal), money(order.shipping), money(order.total), Boolean(order.stockRestored)],
      )
      for (const item of order.items || []) {
        const book = store.books.find((entry) => Number(entry.id) === Number(item.id))
        await client.query(
          `INSERT INTO order_items (order_id,book_id,title_snapshot,price_snapshot,quantity)
           VALUES ($1,$2,$3,$4,$5)`,
          [order.id, book ? book.id : null, item.title || book?.title || 'Removed book',
            money(item.price ?? book?.price), Number(item.quantity)],
        )
      }
    }

    for (const review of reviews) {
      await client.query(
        `INSERT INTO reviews (id,book_id,user_id,rating,text,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [review.id, review.bookId, review.userId, review.rating, review.text, review.createdAt || new Date().toISOString(), review.updatedAt || null],
      )
    }

    for (const table of ['users', 'books', 'orders', 'reviews']) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'),
          GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${table}), 1),
          EXISTS (SELECT 1 FROM ${table}))`,
        [table],
      )
    }
  })

  console.log(`Imported ${users.length} users, ${store.books.length} books, ${orders.length} orders, and ${reviews.length} reviews. Known demo/test accounts were skipped.`)
} catch (error) {
  console.error('JSON store import failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}

import 'dotenv/config'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'

process.env.JWT_SECRET ||= 'bookstore-integration-tests-secret-123456'
process.env.PAYMENT_MODE ||= 'test'
process.env.NODE_ENV = 'test'

const [{ default: app }, { pool }] = await Promise.all([
  import('./server.js'),
  import('./db.js'),
])

const email = `test-${randomUUID()}@example.com`
const title = `Integration Test Book ${randomUUID()}`
const server = app.listen(0)
const baseUrl = await new Promise((resolve, reject) => {
  server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`))
  server.once('error', reject)
})

let bookId
let userId
let token

before(async () => {
  await pool.query('SELECT 1')
})

after(async () => {
  try {
    if (userId) {
      await pool.query('DELETE FROM orders WHERE user_id = $1', [userId])
      await pool.query('DELETE FROM users WHERE id = $1', [userId])
    }
    if (bookId) await pool.query('DELETE FROM books WHERE id = $1', [bookId])
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await pool.end()
  }
})

const request = async (path, { method = 'GET', body, authorization } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { response, body: await response.json() }
}

test('customer registration, authorization, and test-order inventory lifecycle', async (t) => {
  await t.test('rejects invalid registration data', async () => {
    const { response } = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'A', email: 'invalid', password: 'short' },
    })
    assert.equal(response.status, 400)
  })

  await t.test('registers customers and enforces customer-only access', async () => {
    const { response, body } = await request('/api/auth/register', {
      method: 'POST',
      body: { name: ' Test Customer ', email, password: 'integration-test-password' },
    })
    assert.equal(response.status, 201)
    assert.equal(body.user.role, 'customer')
    assert.equal(body.user.name, 'Test Customer')
    assert.equal(Object.hasOwn(body.user, 'password_hash'), false)
    token = body.token
    userId = body.user.id

    const adminResponse = await request('/api/admin/stats', { authorization: token })
    assert.equal(adminResponse.response.status, 403)

    const unauthenticatedResponse = await request('/api/orders')
    assert.equal(unauthenticatedResponse.response.status, 401)
  })

  await t.test('uses server-side prices, prevents overselling, and restores stock on cancellation', async () => {
    const inserted = await pool.query(
      `INSERT INTO books (title, author, category, price, stock, release, cover_gradient, short_title)
       VALUES ($1, 'Test Author', 'Testing', 12.50, 3, 2026, 'none', 'IT')
       RETURNING id`,
      [title],
    )
    bookId = Number(inserted.rows[0].id)

    const insufficient = await request('/api/orders', {
      method: 'POST',
      authorization: token,
      body: { items: [{ id: bookId, quantity: 4 }] },
    })
    assert.equal(insufficient.response.status, 409)
    assert.match(insufficient.body.message, /enough stock/)
    assert.equal(Number((await pool.query('SELECT stock FROM books WHERE id = $1', [bookId])).rows[0].stock), 3)

    const placed = await request('/api/orders', {
      method: 'POST',
      authorization: token,
      body: { items: [{ id: bookId, quantity: 1 }, { id: bookId, quantity: 1, price: 0.01 }] },
    })
    assert.equal(placed.response.status, 201)
    assert.equal(placed.body.order.subtotal, 25)
    assert.equal(placed.body.order.total, 33)
    assert.equal(placed.body.order.paymentMode, 'test')
    assert.equal(Number((await pool.query('SELECT stock FROM books WHERE id = $1', [bookId])).rows[0].stock), 1)

    const cancelled = await request(`/api/orders/${placed.body.order.id}/cancel`, {
      method: 'PATCH',
      authorization: token,
    })
    assert.equal(cancelled.response.status, 200)
    assert.equal(cancelled.body.status, 'cancelled')
    assert.equal(Number((await pool.query('SELECT stock FROM books WHERE id = $1', [bookId])).rows[0].stock), 3)

    const repeatedCancellation = await request(`/api/orders/${placed.body.order.id}/cancel`, {
      method: 'PATCH',
      authorization: token,
    })
    assert.equal(repeatedCancellation.response.status, 409)
    assert.equal(Number((await pool.query('SELECT stock FROM books WHERE id = $1', [bookId])).rows[0].stock), 3)
  })
})

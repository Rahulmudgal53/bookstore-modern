import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, transaction } from './db.js'

const directory = path.dirname(fileURLToPath(import.meta.url))

try {
  const schema = await fs.readFile(path.join(directory, 'schema.sql'), 'utf8')
  await pool.query(schema)

  await transaction(async (client) => {
    const books = [
      [1, 'Atomic Habits', 'James Clear', 'Self Growth', 4.9, 18, 12, 'Bestseller', 2024, 'linear-gradient(135deg, #fbbf24, #f97316)', 'AH', 'An actionable framework for turning tiny habits into life-changing systems.'],
      [2, 'The Psychology of Money', 'Morgan Housel', 'Business', 4.8, 22, 10, 'Popular', 2023, 'linear-gradient(135deg, #60a5fa, #2563eb)', 'PM', 'A timeless guide to how behavior and mindset shape wealth over decades.'],
      [3, 'The Design of Everyday Things', 'Don Norman', 'Design', 4.7, 26, 8, 'Classic', 2022, 'linear-gradient(135deg, #a78bfa, #7c3aed)', 'DE', 'A foundational read on human-centered design and intuitive product thinking.'],
      [4, 'Project Hail Mary', 'Andy Weir', 'Fiction', 5, 20, 14, 'New', 2024, 'linear-gradient(135deg, #34d399, #059669)', 'PH', 'A thrilling, heartfelt science-fiction story about survival and discovery.'],
      [5, 'Deep Work', 'Cal Newport', 'Self Growth', 4.8, 19, 9, 'Focus', 2021, 'linear-gradient(135deg, #fb7185, #e11d48)', 'DW', 'Learn how to sharpen focus and do your best work in a distracted world.'],
      [6, 'A Brief History of Time', 'Stephen Hawking', 'Science', 4.9, 24, 7, 'Featured', 2024, 'linear-gradient(135deg, #38bdf8, #0f172a)', 'BH', 'A dazzling, accessible look at black holes, time, and the universe itself.'],
    ]

    for (const book of books) {
      await client.query(
        `INSERT INTO books (id, title, author, category, rating, price, stock, badge, release,
          cover_gradient, short_title, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO NOTHING`,
        book,
      )
    }

    await client.query(
      `SELECT setval(pg_get_serial_sequence('books', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM books), 1))`,
    )
  })

  for (const role of ['ADMIN', 'MANAGER']) {
    const prefix = `BOOTSTRAP_${role}`
    const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase()
    const password = process.env[`${prefix}_PASSWORD`]
    const name = process.env[`${prefix}_NAME`]?.trim() || (role === 'ADMIN' ? 'Bookstore Admin' : 'Store Manager')

    if (!email && !password) continue
    if (!email || !password || password.length < 14) {
      throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required together; password must be at least 14 characters.`)
    }

    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.default.hash(password, 12)
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [name, email, hash, role.toLowerCase()],
    )
  }

  console.log('PostgreSQL schema and starter catalog are ready.')
} catch (error) {
  console.error('Database setup failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSitemapXml, getSitemapBaseUrl } from './sitemap.js'

test('sitemap defaults to the canonical public domain instead of a local APP_URL', () => {
  assert.equal(getSitemapBaseUrl('http://127.0.0.1:5173'), 'https://morrowhouse.vercel.app')
  assert.equal(getSitemapBaseUrl('https://shop.example.com/path'), 'https://shop.example.com')
})

test('sitemap contains public pages and only the active products provided', () => {
  const sitemap = buildSitemapXml('https://morrowhouse.vercel.app', [
    { id: 'public-product', is_active: true },
    { id: 'inactive-product', is_active: false },
  ])

  assert.match(sitemap, /https:\/\/morrowhouse\.vercel\.app\//)
  assert.match(sitemap, /https:\/\/morrowhouse\.vercel\.app\/shop/)
  assert.match(sitemap, /https:\/\/morrowhouse\.vercel\.app\/product\/public-product/)
  assert.doesNotMatch(sitemap, /inactive-product/)
  assert.doesNotMatch(sitemap, /checkout|track-order|cart/)
})

test('sitemap escapes XML characters in product IDs', () => {
  const sitemap = buildSitemapXml('https://morrowhouse.vercel.app', [{ id: 'product&one' }])

  assert.match(sitemap, /product%26one/)
  assert.doesNotMatch(sitemap, /product&one/)
})

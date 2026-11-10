import assert from 'node:assert/strict'
import test from 'node:test'
import {
  capturePayPalOrder,
  createPayPalOrder,
  getPayPalAccessToken,
  getPayPalOrder,
  getPayPalPublicConfig,
} from './paypal.js'

async function withPayPalEnvironment(overrides, callback) {
  const keys = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_ENVIRONMENT']
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  Object.assign(process.env, overrides)
  try {
    await callback()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function jsonResponse(data, ok = true) {
  return {
    ok,
    text: async () => JSON.stringify(data),
  }
}

test('PayPal remains disabled and never uses embedded credentials when environment values are missing', async () => {
  await withPayPalEnvironment({}, async () => {
    assert.deepEqual(getPayPalPublicConfig(), { enabled: false, clientId: '' })
    await assert.rejects(() => getPayPalAccessToken(), /PayPal is not configured/i)
  })
  await withPayPalEnvironment({ PAYPAL_CLIENT_ID: 'client-id' }, async () => {
    assert.deepEqual(getPayPalPublicConfig(), { enabled: false, clientId: '' })
  })
})

test('PayPal defaults to the existing live API when an environment is not explicitly selected', async () => {
  await withPayPalEnvironment({
    PAYPAL_CLIENT_ID: 'live-client-id',
    PAYPAL_CLIENT_SECRET: 'live-server-secret',
  }, async () => {
    const previousFetch = global.fetch
    global.fetch = async (url) => {
      assert.equal(url, 'https://api-m.paypal.com/v1/oauth2/token')
      return jsonResponse({ access_token: 'live-access-token' })
    }
    try {
      assert.equal((await getPayPalAccessToken()).baseUrl, 'https://api-m.paypal.com')
    } finally {
      global.fetch = previousFetch
    }
  })
})

test('PayPal uses sandbox credentials and returns only the public client ID to the browser', async () => {
  await withPayPalEnvironment({
    PAYPAL_CLIENT_ID: 'sandbox-client-id',
    PAYPAL_CLIENT_SECRET: 'server-only-secret',
    PAYPAL_ENVIRONMENT: 'sandbox',
  }, async () => {
    const previousFetch = global.fetch
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token')
      assert.equal(options.headers.Authorization, `Basic ${Buffer.from('sandbox-client-id:server-only-secret').toString('base64')}`)
      return jsonResponse({ access_token: 'access-token' })
    }
    try {
      assert.deepEqual(getPayPalPublicConfig(), { enabled: true, clientId: 'sandbox-client-id' })
      assert.deepEqual(await getPayPalAccessToken(), {
        accessToken: 'access-token',
        baseUrl: 'https://api-m.sandbox.paypal.com',
      })
    } finally {
      global.fetch = previousFetch
    }
  })
})

test('PayPal order creation validates amounts and sends the expected currency and merchant reference', async () => {
  await withPayPalEnvironment({
    PAYPAL_CLIENT_ID: 'live-client-id',
    PAYPAL_CLIENT_SECRET: 'live-secret',
    PAYPAL_ENVIRONMENT: 'live',
  }, async () => {
    await assert.rejects(() => createPayPalOrder({ amountUsd: 0, orderId: 'MH-test' }), /greater than zero/i)
    const previousFetch = global.fetch
    let orderRequest
    global.fetch = async (url, options) => {
      if (url.endsWith('/v1/oauth2/token')) return jsonResponse({ access_token: 'live-token' })
      orderRequest = { url, body: JSON.parse(options.body) }
      return jsonResponse({ id: 'paypal-order-id', status: 'CREATED' })
    }
    try {
      const order = await createPayPalOrder({ amountUsd: 165, orderId: 'MH-test' })
      assert.equal(order.id, 'paypal-order-id')
      assert.equal(orderRequest.url, 'https://api-m.paypal.com/v2/checkout/orders')
      assert.equal(orderRequest.body.purchase_units[0].custom_id, 'MH-test')
      assert.deepEqual(orderRequest.body.purchase_units[0].amount, { currency_code: 'USD', value: '165.00' })
    } finally {
      global.fetch = previousFetch
    }
  })
})

test('PayPal lookup and capture safely encode order IDs', async () => {
  await withPayPalEnvironment({
    PAYPAL_CLIENT_ID: 'client-id',
    PAYPAL_CLIENT_SECRET: 'server-secret',
    PAYPAL_ENVIRONMENT: 'sandbox',
  }, async () => {
    const previousFetch = global.fetch
    const requestedUrls = []
    global.fetch = async (url) => {
      requestedUrls.push(url)
      if (url.endsWith('/v1/oauth2/token')) return jsonResponse({ access_token: 'access-token' })
      return jsonResponse({ id: 'order/with space', status: 'APPROVED' })
    }
    try {
      await getPayPalOrder('order/with space')
      await capturePayPalOrder('order/with space')
      assert.ok(requestedUrls.includes('https://api-m.sandbox.paypal.com/v2/checkout/orders/order%2Fwith%20space'))
      assert.ok(requestedUrls.includes('https://api-m.sandbox.paypal.com/v2/checkout/orders/order%2Fwith%20space/capture'))
    } finally {
      global.fetch = previousFetch
    }
  })
})

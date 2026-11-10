import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'

test('PayPal verification confirms payment with PayPal and rejects unrelated or incomplete orders', async () => {
  const envKeys = [
    'VERCEL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_ENVIRONMENT',
  ]
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, {
    VERCEL: '1',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    PAYPAL_CLIENT_ID: 'test-client-id',
    PAYPAL_CLIENT_SECRET: 'test-server-secret',
    PAYPAL_ENVIRONMENT: 'sandbox',
  })

  const nativeFetch = global.fetch
  let paypalOrder = {
    id: 'paypal-order',
    status: 'APPROVED',
    purchase_units: [{
      custom_id: 'MH-test-order',
      amount: { currency_code: 'USD', value: '25.00' },
    }],
  }
  global.fetch = async (url) => {
    if (String(url).endsWith('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'test-access-token' }), { status: 200 })
    }
    return new Response(JSON.stringify(paypalOrder), { status: 200 })
  }

  let server
  try {
    const { app } = await import(`../server.js?paypal-route-test=${Date.now()}`)
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    const origin = `http://127.0.0.1:${address.port}`

    const configResponse = await nativeFetch(`${origin}/api/paypal/config`)
    const publicConfig = await configResponse.json()
    assert.deepEqual(publicConfig, { enabled: true, clientId: 'test-client-id' })

    const pendingResponse = await nativeFetch(`${origin}/api/paypal/verify/paypal-order`)
    assert.equal(pendingResponse.status, 200)
    assert.equal((await pendingResponse.json()).paymentStatus, 'pending')

    paypalOrder = {
      ...paypalOrder,
      status: 'COMPLETED',
      purchase_units: [{
        ...paypalOrder.purchase_units[0],
        payments: {
          captures: [{
            id: 'capture-id',
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '25.00' },
          }],
        },
      }],
    }
    const completedResponse = await nativeFetch(`${origin}/api/paypal/verify/paypal-order`)
    assert.equal(completedResponse.status, 200)
    assert.equal((await completedResponse.json()).paymentStatus, 'paid')

    paypalOrder = {
      ...paypalOrder,
      purchase_units: [{ ...paypalOrder.purchase_units[0], custom_id: 'NOT-A-MORROW-HOUSE-ORDER' }],
    }
    const unrelatedResponse = await nativeFetch(`${origin}/api/paypal/verify/other-order`)
    assert.equal(unrelatedResponse.status, 404)
  } finally {
    global.fetch = nativeFetch
    if (server) {
      server.close()
      await once(server, 'close')
    }
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

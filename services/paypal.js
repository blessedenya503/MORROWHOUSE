function getPayPalConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim()
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim()
  const environment = (process.env.PAYPAL_ENVIRONMENT || 'live').trim().toLowerCase()

  if (!clientId || !clientSecret) {
    const error = new Error('PayPal is not configured on the server.')
    error.code = 'PAYPAL_NOT_CONFIGURED'
    throw error
  }
  if (environment !== 'sandbox' && environment !== 'live') {
    const error = new Error('PAYPAL_ENVIRONMENT must be set to sandbox or live.')
    error.code = 'PAYPAL_INVALID_CONFIGURATION'
    throw error
  }

  return {
    clientId,
    clientSecret,
    environment,
    baseUrl: environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
  }
}

async function readPayPalResponse(response, fallbackMessage) {
  const responseText = await response.text()
  let data = {}
  if (responseText) {
    try {
      data = JSON.parse(responseText)
    } catch {
      if (response.ok) throw new Error('PayPal returned an invalid response.')
    }
  }
  if (!response.ok) {
    throw new Error(data.error_description || data.message || fallbackMessage)
  }
  return data
}

export function getPayPalPublicConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() || ''
  const environment = (process.env.PAYPAL_ENVIRONMENT || 'live').trim().toLowerCase()
  const validEnvironment = environment === 'sandbox' || environment === 'live'
  const enabled = Boolean(clientId && clientSecret && validEnvironment)
  return {
    enabled,
    clientId: enabled ? clientId : '',
  }
}

export async function getPayPalAccessToken() {
  const config = getPayPalConfig()
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await readPayPalResponse(response, 'Failed to authenticate with PayPal.')
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('PayPal did not return an access token.')
  }
  return { accessToken: data.access_token, baseUrl: config.baseUrl }
}

export async function createPayPalOrder({ amountUsd, orderId }) {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error('PayPal order amount must be greater than zero.')
  }
  const { accessToken, baseUrl } = await getPayPalAccessToken()
  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: orderId,
          custom_id: orderId,
          description: `Morrow House Order ${orderId}`,
          amount: {
            currency_code: 'USD',
            value: amountUsd.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'Morrow House',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    }),
  })
  return readPayPalResponse(response, 'PayPal order creation failed.')
}

export async function getPayPalOrder(paypalOrderId) {
  if (typeof paypalOrderId !== 'string' || !paypalOrderId.trim()) {
    throw new Error('A PayPal order ID is required.')
  }
  const { accessToken, baseUrl } = await getPayPalAccessToken()
  const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return readPayPalResponse(response, 'PayPal order verification failed.')
}

export async function capturePayPalOrder(paypalOrderId) {
  if (typeof paypalOrderId !== 'string' || !paypalOrderId.trim()) {
    throw new Error('A PayPal order ID is required.')
  }
  const { accessToken, baseUrl } = await getPayPalAccessToken()
  const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  return readPayPalResponse(response, 'PayPal order capture failed.')
}

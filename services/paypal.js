const paypalClientId = process.env.PAYPAL_CLIENT_ID || 'BAA8xpQ0fXsTMOpkUFyj8rdrha9-zaFXnV7fOQ0O5u6vFnnTJsjfQ9pbWVuVinMfFa6gRcvXd1bhP2q8xQ';
const paypalSecret = process.env.PAYPAL_CLIENT_SECRET || 'EDxC-48eGADBCeAXgnlS-TV_bJagDXBw14uce68UGYiSGB1TlbbAHPGVaXX7N-f3zH18hcpMFlo9qaAG';
const paypalBaseUrl = 'https://api-m.paypal.com';

export async function getPayPalAccessToken() {
  const auth = Buffer.from(paypalClientId + ':' + paypalSecret).toString('base64');
  const res = await fetch(paypalBaseUrl + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.message || 'Failed to authenticate with PayPal');
  }
  return data.access_token;
}

export async function createPayPalOrder({ amountUsd, items = [], orderId, customerEmail }) {
  const accessToken = await getPayPalAccessToken();
  const res = await fetch(paypalBaseUrl + '/v2/checkout/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: orderId,
          custom_id: orderId,
          description: 'Morrow House Order ' + orderId,
          amount: {
            currency_code: 'USD',
            value: Number(amountUsd).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'Morrow House',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'PayPal order creation failed');
  }
  return data;
}

export async function capturePayPalOrder(paypalOrderId) {
  const accessToken = await getPayPalAccessToken();
  const res = await fetch(paypalBaseUrl + '/v2/checkout/orders/' + encodeURIComponent(paypalOrderId) + '/capture', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'PayPal order capture failed');
  }
  return data;
}

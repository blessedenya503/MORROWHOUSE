import test from 'node:test'
import assert from 'node:assert/strict'
import { getShippingCost, validateCheckoutDetails } from './checkout-validation.js'

const validCheckout = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+1 (416) 555-0100',
  shippingMethod: 'ground',
  sameBillingAddress: true,
  shippingAddress: {
    line1: '12 King Street',
    line2: '',
    city: 'Toronto',
    region: 'Ontario',
    postalCode: 'M5H 1A1',
    country: 'CA',
  },
  billingAddress: {},
}

test('checkout validates and normalizes required customer and delivery details', () => {
  const details = validateCheckoutDetails(validCheckout)
  assert.equal(details.fullName, 'Ada Lovelace')
  assert.equal(details.shippingAddress.country, 'CA')
  assert.deepEqual(details.billingAddress, details.shippingAddress)
})

test('checkout requires a separate valid billing address when not using shipping', () => {
  assert.throws(() => validateCheckoutDetails({
    ...validCheckout,
    sameBillingAddress: false,
    billingAddress: { country: 'US' },
  }), /Billing street address/)

  const details = validateCheckoutDetails({
    ...validCheckout,
    sameBillingAddress: false,
    billingAddress: {
      line1: '4 Market Street',
      city: 'San Francisco',
      region: 'California',
      postalCode: '94105',
      country: 'US',
    },
  })
  assert.equal(details.billingAddress.country, 'US')
})

test('checkout rejects unsupported shipping, invalid contact fields and inactive coupons', () => {
  assert.throws(() => validateCheckoutDetails({ ...validCheckout, email: 'invalid' }), /valid email/)
  assert.throws(() => validateCheckoutDetails({ ...validCheckout, phone: 'letters only' }), /valid phone/)
  assert.throws(() => validateCheckoutDetails({
    ...validCheckout,
    shippingAddress: { ...validCheckout.shippingAddress, country: 'GB' },
  }), /only for addresses in the United States and Canada/)
  assert.throws(() => validateCheckoutDetails(validCheckout, 'SAVE10'), /no active coupon codes/)
})

test('shipping cost follows the existing $15 and $150 free-shipping rule', () => {
  assert.equal(getShippingCost(149.99), 15)
  assert.equal(getShippingCost(150), 0)
  assert.throws(() => getShippingCost(-1), /subtotal is invalid/)
})

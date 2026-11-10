const supportedCountries = new Set(['US', 'CA'])
const checkoutMethods = new Set(['ground'])

function requiredText(value, label, maxLength = 200) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new Error(`${label} is required and must be ${maxLength} characters or fewer.`)
  return normalized
}

function optionalText(value, label, maxLength = 200) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`)
  }
  return value.trim()
}

function validateAddress(address, label) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    throw new Error(`${label} address is required.`)
  }
  const country = requiredText(address.country, `${label} country`, 2).toUpperCase()
  if (!supportedCountries.has(country)) {
    throw new Error('Checkout is currently available only for addresses in the United States and Canada.')
  }
  return {
    line1: requiredText(address.line1, `${label} street address`),
    line2: optionalText(address.line2, `${label} apartment or suite`),
    city: requiredText(address.city, `${label} city`, 100),
    region: requiredText(address.region, `${label} state or province`, 100),
    postalCode: requiredText(address.postalCode, `${label} ZIP or postal code`, 24),
    country,
  }
}

export function validateCheckoutDetails(details, couponCode = '') {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    throw new Error('Checkout contact and delivery details are required.')
  }
  if (typeof details.sameBillingAddress !== 'boolean') {
    throw new Error('Choose whether your billing address matches your delivery address.')
  }
  if (typeof couponCode !== 'string' || couponCode.trim()) {
    throw new Error('There are no active coupon codes right now. Please contact us if you need help with a promotion.')
  }

  const firstName = requiredText(details.firstName, 'First name', 100)
  const lastName = requiredText(details.lastName, 'Last name', 100)
  const email = requiredText(details.email, 'Email address', 254)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')

  const phone = requiredText(details.phone, 'Phone number', 30)
  if (!/^\+?[0-9\s().-]{7,30}$/.test(phone) || phone.replace(/\D/g, '').length < 7) {
    throw new Error('Enter a valid phone number.')
  }

  const shippingAddress = validateAddress(details.shippingAddress, 'Delivery')
  if (!checkoutMethods.has(details.shippingMethod)) {
    throw new Error('Choose an available shipping method.')
  }
  const billingAddress = details.sameBillingAddress
    ? shippingAddress
    : validateAddress(details.billingAddress, 'Billing')

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email,
    phone,
    shippingMethod: details.shippingMethod,
    shippingAddress,
    sameBillingAddress: details.sameBillingAddress,
    billingAddress,
  }
}

export function getShippingCost(subtotal) {
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error('Order subtotal is invalid.')
  return subtotal >= 150 ? 0 : 15
}

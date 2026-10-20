export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)

export const imageUrl = (photo, width = 1000) => {
  const source = String(photo || '').trim()
  if (!source) return ''
  const wrappedSource = source.match(/^https?:\/\/images\.unsplash\.com\/(https?:\/\/[^?]+)(?:\?.*)?$/i)
  if (wrappedSource) return wrappedSource[1]
  if (/^https?:\/\//i.test(source)) return source
  if (source.startsWith('//')) return `https:${source}`
  return `https://images.unsplash.com/${source}?auto=format&fit=crop&w=${width}&q=80`
}
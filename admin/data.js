export const previewProducts = [
  { id: 'lune-chair', name: 'Lune Lounge Chair', category: 'Living', price: 890, stock: 7, reorderAt: 5, image: 'photo-1567538096630-e0c55bd6374c', sku: 'MH-LIV-001' },
  { id: 'sora-lamp', name: 'Sora Table Lamp', category: 'Lighting', price: 245, stock: 3, reorderAt: 5, image: 'photo-1507473885765-e6ed057f782c', sku: 'MH-LGT-002' },
  { id: 'form-vase', name: 'Form No. 02 Vessel', category: 'Objects', price: 118, stock: 2, reorderAt: 4, image: 'photo-1578500494198-246f612d3b3d', sku: 'MH-OBJ-003' },
  { id: 'cloud-throw', name: 'Cloud Weave Throw', category: 'Living', price: 195, stock: 14, reorderAt: 5, image: 'photo-1600210491892-03d54c0aaf87', sku: 'MH-LIV-004' },
]

export const previewOrders = [
  { id: 'DEMO-1048', customer: 'Amelia Bennett', email: 'amelia@example.test', placed: 'Today, 10:42 AM', items: 2, total: 1135, status: 'Processing', products: ['Lune Lounge Chair', 'Sora Table Lamp'] },
  { id: 'DEMO-1047', customer: 'Noah Williams', email: 'noah@example.test', placed: 'Today, 9:18 AM', items: 1, total: 118, status: 'Paid', products: ['Form No. 02 Vessel'] },
  { id: 'DEMO-1046', customer: 'Sofia Chen', email: 'sofia@example.test', placed: 'Yesterday, 4:06 PM', items: 2, total: 390, status: 'Fulfilled', products: ['Cloud Weave Throw', 'Form No. 02 Vessel'] },
  { id: 'DEMO-1045', customer: 'Oliver James', email: 'oliver@example.test', placed: 'Yesterday, 1:33 PM', items: 1, total: 245, status: 'Processing', products: ['Sora Table Lamp'] },
  { id: 'DEMO-1044', customer: 'Maya Rivera', email: 'maya@example.test', placed: 'Sep 27, 11:21 AM', items: 2, total: 1008, status: 'Fulfilled', products: ['Lune Lounge Chair', 'Form No. 02 Vessel'] },
]

export const previewRevenue = [
  { day: 'Mon', amount: 1250 },
  { day: 'Tue', amount: 2180 },
  { day: 'Wed', amount: 1740 },
  { day: 'Thu', amount: 2860 },
  { day: 'Fri', amount: 2320 },
  { day: 'Sat', amount: 3410 },
  { day: 'Sun', amount: 2660 },
]
import type { Product } from './types'

/**
 * Fixture product/listing data — ported from the approved prototype
 * (docs/design/prototype-v1.html, PRODUCTS). Not yet rendered on the Home
 * screen, but included now (per brief) so Search/Product-detail builds in
 * later sessions share the same fixtures rather than re-deriving them.
 */
export const PRODUCTS: Product[] = [
  {
    id: 'tank5000',
    businessId: 'aquatank',
    name: '5,000L Vertical Water Tank',
    price: 42500,
    grad: 0,
    icon: '🛢️',
    specs: {
      Capacity: '5,000 Litres',
      Material: 'Polyethylene (Rotomoulded)',
      Warranty: '5 Years',
      Availability: 'In stock — Nairobi & Nakuru depots',
    },
    tags: ['water tank', 'tank', '5000l', 'storage', 'water'],
  },
  {
    id: 'tank10000',
    businessId: 'aquatank',
    name: '10,000L Loft Water Tank',
    price: 78000,
    grad: 0,
    icon: '🛢️',
    specs: {
      Capacity: '10,000 Litres',
      Material: 'Polyethylene (Rotomoulded)',
      Warranty: '5 Years',
      Availability: 'Made to order — 5 days',
    },
    tags: ['water tank', 'tank', '10000l', 'loft tank', 'water'],
  },
  {
    id: 'tank1000',
    businessId: 'aquatank',
    name: '1,000L Slimline Tank',
    price: 14200,
    grad: 2,
    icon: '🛢️',
    specs: {
      Capacity: '1,000 Litres',
      Material: 'Polyethylene (Rotomoulded)',
      Warranty: '3 Years',
      Availability: 'In stock — Nairobi',
    },
    tags: ['water tank', 'slimline', 'tank', 'water'],
  },
  {
    id: 'solarpump',
    businessId: 'sunflow',
    name: 'Solar Water Pump SP-200',
    price: 68000,
    grad: 1,
    icon: '☀️',
    specs: { Capacity: '200 L/min', Power: '1.5kW solar array', Warranty: '3 Years', Availability: 'Made to order — 7 days' },
    tags: ['solar pump', 'irrigation', 'solar irrigation', 'systems'],
  },
  {
    id: 'dripkit',
    businessId: 'sunflow',
    name: 'Drip Irrigation Starter Kit (1 Acre)',
    price: 24000,
    grad: 1,
    icon: '💧',
    specs: { Coverage: '1 Acre', Components: 'Pump, filters, driplines, timer', Warranty: '1 Year', Availability: 'In stock — Nakuru' },
    tags: ['drip irrigation', 'irrigation', 'solar irrigation', 'farm', 'systems'],
  },
  {
    id: 'steelsheet',
    businessId: 'nairobisteel',
    name: 'Steel Roofing Sheets — Gauge 28',
    price: 980,
    grad: 2,
    icon: '⚙️',
    specs: { Gauge: '28', Length: 'Cut to order', Warranty: '10 Years', Availability: 'In stock' },
    tags: ['steel', 'roofing', 'construction'],
  },
  {
    id: 'maizeseed',
    businessId: 'greengrow',
    name: 'Certified Maize Seed — Hybrid 614',
    price: 650,
    grad: 3,
    icon: '🌽',
    specs: { Variety: 'H614', Maturity: '120–140 days', Pack: '2kg bag', Availability: 'In stock' },
    tags: ['seed', 'maize', 'agriculture'],
  },
  {
    id: 'inverter',
    businessId: 'solaris',
    name: '5kW Hybrid Solar Inverter',
    price: 145000,
    grad: 4,
    icon: '🔋',
    specs: { Output: '5kW', Battery: 'Lithium/Lead-acid compatible', Warranty: '5 Years', Availability: 'In stock — Kisumu & Nairobi' },
    tags: ['solar', 'inverter', 'power', 'energy'],
  },
]

export const prodById = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id)

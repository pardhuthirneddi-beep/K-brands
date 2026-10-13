export type SizeGuide = { title: string; note: string; howTo: string; columns: string[]; rows: string[][] };

/**
 * Measurement blocks referenced by products via `size_guide_key`. These are
 * generic fit blocks used to build and test sizing; the owner must replace them
 * with the brand's graded specs before real products publish.
 */
export const SIZE_GUIDES: Record<string, SizeGuide> = {
  'standard-tops': {
    title: 'Shirts, tees and knitwear',
    note: 'Chest and body width measured flat, half-circumference. Sleeve from centre-back.',
    howTo: 'Take a garment you like, button it, lay it flat and measure across. Compare that to the chest figure here.',
    columns: ['Size', 'Chest (flat)', 'Body width', 'Length', 'Sleeve'],
    rows: [
      ['XS', '48', '46', '68', '60'],
      ['S', '51', '49', '70', '61'],
      ['M', '54', '52', '72', '62'],
      ['L', '57', '55', '74', '63'],
      ['XL', '60', '58', '76', '64'],
      ['XXL', '63', '61', '78', '65'],
    ],
  },
  'bottoms-waist': {
    title: 'Trousers and chinos',
    note: 'Waist is the garment measurement, not your body. Add the ease you prefer.',
    howTo: 'Measure the waistband of a pair that fits, then match it here. Thigh is measured 2.5cm below the crotch seam.',
    columns: ['Size (in)', 'Waist (cm)', 'Hip (cm)', 'Thigh (cm)', 'Inseam (cm)'],
    rows: [
      ['28', '72', '98', '60', '78'],
      ['30', '77', '102', '62', '80'],
      ['32', '82', '106', '64', '81'],
      ['34', '87', '110', '66', '82'],
      ['36', '92', '114', '68', '83'],
      ['38', '97', '118', '70', '84'],
    ],
  },
  'one-size': {
    title: 'One-size accessories',
    note: 'Accessories are made to a single dimension so they layer without sizing choices.',
    howTo: 'Check the flat dimensions against how you actually wear the piece — a scarf looped twice needs more length than one draped.',
    columns: ['Size', 'Length', 'Width'],
    rows: [['One size', '180', '30']],
  },
};

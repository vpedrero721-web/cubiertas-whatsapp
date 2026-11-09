import { addOnPrices } from './catalog.js';

export const MAX_AUTOMATIC_METERS = 3.66;
export const QUOTE_VALIDITY_DAYS = 15;

const money = (amount) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);

function assertCount(label, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `La cantidad de ${label} debe ser un entero igual o mayor que cero.`,
    );
  }
}

export function calculateQuote(
  product,
  meters,
  cantidad_cortes_45,
  cantidad_perforaciones,
  cantidad_pegados_cenefa = 0,
  now = new Date(),
) {
  if (!product || !Number.isFinite(product.pricePerMeter) || product.pricePerMeter < 0) {
    throw new TypeError('Selecciona un producto válido del catálogo.');
  }
  if (!Number.isFinite(meters) || meters <= 0) {
    throw new RangeError('Los metros deben ser un número mayor que cero.');
  }

  assertCount('cortes a 45°', cantidad_cortes_45);
  assertCount('perforaciones', cantidad_perforaciones);
  assertCount('pegados de cenefa', cantidad_pegados_cenefa);

  const lines = [
    {
      description: `${product.name} (${meters} m × ${money(product.pricePerMeter)}/m)`,
      quantity: meters,
      unitPrice: product.pricePerMeter,
      total: Math.round(meters * product.pricePerMeter),
    },
    {
      description: addOnPrices.cut45.label,
      quantity: cantidad_cortes_45,
      unitPrice: addOnPrices.cut45.unitPrice,
      total: cantidad_cortes_45 * addOnPrices.cut45.unitPrice,
    },
    {
      description: addOnPrices.edgeBanding.label,
      quantity: cantidad_pegados_cenefa,
      unitPrice: addOnPrices.edgeBanding.unitPrice,
      total: cantidad_pegados_cenefa * addOnPrices.edgeBanding.unitPrice,
    },
    {
      description: addOnPrices.perforation.label,
      quantity: cantidad_perforaciones,
      unitPrice: addOnPrices.perforation.unitPrice,
      total: cantidad_perforaciones * addOnPrices.perforation.unitPrice,
    },
  ];

  const validUntil = new Date(now);
  validUntil.setDate(validUntil.getDate() + QUOTE_VALIDITY_DAYS);

  return {
    product,
    meters,
    lines,
    total: lines.reduce((sum, line) => sum + line.total, 0),
    currency: 'CLP',
    validForDays: QUOTE_VALIDITY_DAYS,
    validUntil,
  };
}

export function formatQuote(quote) {
  const breakdown = quote.lines
    .map((line) => `• ${line.description}: ${money(line.total)}`)
    .join('\n');

  return [
    'PRE-COTIZACIÓN REFERENCIAL',
    quote.product.name,
    '',
    breakdown,
    '',
    `TOTAL: ${money(quote.total)} CLP`,
    `Válida hasta: ${quote.validUntil.toLocaleDateString('es-CL')}`,
    '',
    'Valores referenciales; disponibilidad, medidas y precio final deben confirmarse con el taller.',
  ].join('\n');
}

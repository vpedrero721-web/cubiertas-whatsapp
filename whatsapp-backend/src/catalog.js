const imageUrl = (value) => value?.trim() || null;

export const products = [
  {
    id: 'mdf-blanco',
    name: 'Cubierta postformada blanca',
    material: 'MDF',
    finish: 'Blanco liso',
    pricePerMeter: 39990,
    imageUrl: imageUrl(process.env.IMAGE_MDF_BLANCO),
    technicalSheet:
      'MDF con laminado decorativo blanco. Ficha técnica por confirmar con el taller.',
  },
  {
    id: 'mdf-madera',
    name: 'Cubierta postformada madera',
    material: 'MDF',
    finish: 'Textura madera',
    pricePerMeter: 44990,
    imageUrl: imageUrl(process.env.IMAGE_MDF_MADERA),
    technicalSheet:
      'MDF con laminado decorativo tipo madera. Ficha técnica por confirmar con el taller.',
  },
  {
    id: 'mdf-grafito',
    name: 'Cubierta postformada grafito',
    material: 'MDF',
    finish: 'Grafito',
    pricePerMeter: 46990,
    imageUrl: imageUrl(process.env.IMAGE_MDF_GRAFITO),
    technicalSheet:
      'MDF con laminado decorativo grafito. Ficha técnica por confirmar con el taller.',
  },
];

export const addOnPrices = {
  cut45: { label: 'Corte a 45°', unitPrice: 5000 },
  edgeBanding: { label: 'Pegado de cenefa', unitPrice: 3500 },
  perforation: {
    label: 'Perforación para lavaplatos/encimera',
    unitPrice: 8000,
  },
};

export function getProduct(productId) {
  return products.find((product) => product.id === productId) ?? null;
}

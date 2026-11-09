import { getProduct, products } from './catalog.js';
import {
  calculateQuote,
  formatQuote,
  MAX_AUTOMATIC_METERS,
} from './quote.js';
import { loadSession, saveSession } from './storage.js';
import { sendButtons, sendImage, sendText } from './whatsapp.js';

const FIELD_PROMPTS = {
  meters: '¿Cuántos metros lineales necesitas? Escribe, por ejemplo, 2,40.',
  cuts45: '¿Cuántos cortes a 45° necesitas? Escribe un número entero.',
  edgeBanding: '¿Cuántos pegados de cenefa necesitas? Escribe un número entero.',
  perforations: '¿Cuántas perforaciones necesitas? Escribe un número entero.',
};

const mainMenuButtons = [
  { id: 'menu:quote', title: 'Cotizar' },
  { id: 'menu:catalog', title: 'Ver catálogo' },
  { id: 'menu:human', title: 'Hablar con asesor' },
];

const quotesEnabled = () => process.env.QUOTES_ENABLED === 'true';

function startQuote(session) {
  if (!quotesEnabled()) {
    session.step = 'menu';
    return sendButtons(
      session.phone,
      'Las precotizaciones automáticas están temporalmente desactivadas mientras el taller confirma sus precios. Puedes consultar con un asesor.',
      [
        { id: 'menu:human', title: 'Hablar con asesor' },
        { id: 'menu:catalog', title: 'Ver catálogo' },
        { id: 'menu:home', title: 'Menú principal' },
      ],
    );
  }

  session.step = 'material';
  session.quote = {};
  return sendButtons(
    session.phone,
    'Paso 1 de 3 · Elige el tipo de cubierta y terminación:',
    products.map((product, index) => ({
      id: `product:${product.id}`,
      title: `${index + 1}. ${product.finish} · ${product.pricePerMeter.toLocaleString('es-CL')}/m`,
    })),
  );
}

async function showCatalog(phone) {
  await sendText(
    phone,
    products
      .map(
        (product, index) =>
        `${index + 1}. ${product.name} — ${product.finish}${quotesEnabled() ? ` — ${product.pricePerMeter.toLocaleString('es-CL')} CLP/m` : ''}\n${product.technicalSheet}`,
      )
      .join('\n\n'),
  );
  await sendButtons(phone, '¿Quieres iniciar una precotización?', [
    { id: 'menu:quote', title: 'Cotizar' },
    { id: 'menu:human', title: 'Hablar con asesor' },
    { id: 'menu:home', title: 'Menú principal' },
  ]);
}

async function requestHuman(phone, session, reason) {
  const advisorPhone = process.env.HUMAN_PHONE_NUMBER;
  session.step = 'human';

  if (!advisorPhone) {
    await sendText(
      phone,
      `Necesitas atención de un asesor: ${reason}\n\nLa derivación aún no está conectada. Configura HUMAN_PHONE_NUMBER para notificar al equipo.`,
    );
    return;
  }

  await sendText(
    advisorPhone,
    `Solicitud de asesor desde WhatsApp\nCliente: ${phone}\nMotivo: ${reason}`,
  );
  await sendText(
    phone,
    'Tu solicitud fue enviada a un asesor. Te contactaremos para revisar el pedido.',
  );
}

function parseNumber(text) {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

async function processDimensions(phone, session, text) {
  if (!quotesEnabled()) {
    await startQuote(session);
    return;
  }

  const field = session.field;
  const value = parseNumber(text);

  if (value === null || (field !== 'meters' && !Number.isInteger(value))) {
    await sendText(
      phone,
      field === 'meters'
        ? 'Ingresa una medida válida mayor que cero, por ejemplo 2,40.'
        : 'Ingresa una cantidad como número entero igual o mayor que cero.',
    );
    return;
  }

  if (field === 'meters' && value <= 0) {
    await sendText(phone, 'La medida debe ser mayor que cero. Escribe, por ejemplo, 2,40.');
    return;
  }

  if (field === 'meters' && value > MAX_AUTOMATIC_METERS) {
    await requestHuman(
      phone,
      session,
      `medida de ${value} m supera el máximo automático de ${MAX_AUTOMATIC_METERS} m`,
    );
    return;
  }

  if (field !== 'meters' && value < 0) {
    await sendText(phone, 'La cantidad debe ser igual o mayor que cero.');
    return;
  }

  session.quote[field] = value;
  const nextFields = ['meters', 'cuts45', 'edgeBanding', 'perforations'];
  const nextField = nextFields[nextFields.indexOf(field) + 1];

  if (nextField) {
    session.field = nextField;
    await sendText(phone, FIELD_PROMPTS[nextField]);
    return;
  }

  const product = getProduct(session.quote.productId);
  const quote = calculateQuote(
    product,
    session.quote.meters,
    session.quote.cuts45,
    session.quote.perforations,
    session.quote.edgeBanding,
  );

  session.step = 'quote';
  await sendText(phone, `Paso 3 de 3\n\n${formatQuote(quote)}`);
  await sendButtons(phone, '¿Qué deseas hacer ahora?', [
    { id: 'menu:human', title: 'Validar con asesor' },
    { id: 'menu:quote', title: 'Nueva cotización' },
    { id: 'menu:home', title: 'Menú principal' },
  ]);
}

async function handleChoice(phone, session, input) {
  const normalized = input.toLocaleLowerCase('es-CL');
  if (
    ['/asesor', '/humano', 'asesor', 'asesor humano', 'humano', 'menu:human'].includes(
      normalized,
    )
  ) {
    await requestHuman(phone, session, 'el cliente solicitó atención humana');
    return;
  }

  if (input === 'menu:home') {
    session.step = 'menu';
    await sendButtons(phone, '¡Hola! ¿En qué podemos ayudarte?', mainMenuButtons);
    return;
  }

  if (input === 'menu:catalog') {
    session.step = 'menu';
    await showCatalog(phone);
    return;
  }

  if (input === 'menu:quote') {
    await startQuote(session);
    return;
  }

  if (input.startsWith('product:')) {
    if (!quotesEnabled()) {
      await startQuote(session);
      return;
    }

    const product = getProduct(input.slice('product:'.length));
    if (!product) {
      await startQuote(session);
      return;
    }

    session.step = 'dimensions';
    session.field = 'meters';
    session.quote = { productId: product.id };
    await sendText(
      phone,
      `${product.name}\nMaterial: ${product.material}\nTerminación: ${product.finish}\nPrecio referencial: ${product.pricePerMeter.toLocaleString('es-CL')} CLP/m\n${product.technicalSheet}`,
    );
    if (product.imageUrl) {
      await sendImage(phone, product.imageUrl, product.finish);
    }
    await sendText(phone, `Paso 2 de 3\n${FIELD_PROMPTS.meters}`);
    return;
  }

  if (input === 'faq:price') {
    await sendText(
      phone,
      'Los precios son referenciales. Disponibilidad, medidas y precio final deben confirmarse con el taller.',
    );
    await sendButtons(phone, '¿Necesitas algo más?', mainMenuButtons);
    return;
  }

  if (normalized.includes('laboratorio')) {
    await requestHuman(phone, session, 'mesón de laboratorio requiere revisión personalizada');
    return;
  }

  if (session.step === 'dimensions') {
    await processDimensions(phone, session, input);
    return;
  }

  await sendButtons(
    phone,
    'No reconocí esa opción. Usa un botón o escribe /asesor para solicitar ayuda humana.',
    mainMenuButtons,
  );
}

export async function handleIncomingMessage(phone, input) {
  const session = await loadSession(phone);
  session.phone = phone;
  const normalized = input.trim();

  try {
    if (!normalized) {
      await sendText(phone, 'No recibí texto. Usa una opción del menú o escribe /asesor.');
      return;
    }

    if (session.step === 'menu' && !normalized.startsWith('menu:') && !normalized.startsWith('product:')) {
      const choice = normalized.toLocaleLowerCase('es-CL');
      if (choice === '1' || choice.includes('cotiz')) {
        await startQuote(session);
        return;
      }
      if (choice === '2' || choice.includes('catálogo') || choice.includes('catalogo')) {
        await showCatalog(phone);
        return;
      }
      if (choice === '3' || choice.includes('pregunta')) {
        await sendText(
          phone,
          'Precios referenciales sujetos a confirmación. Los plazos dependen del diseño y la carga del taller. Para materiales, disponibilidad y medidas especiales, consulta con un asesor.',
        );
        await sendButtons(phone, '¿Necesitas algo más?', mainMenuButtons);
        return;
      }
    }

    await handleChoice(phone, session, normalized);
  } finally {
    delete session.phone;
    await saveSession(phone, session);
  }
}

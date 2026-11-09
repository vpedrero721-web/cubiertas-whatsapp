const apiVersion = process.env.WHATSAPP_API_VERSION;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

async function send(to, message) {
  if (!apiVersion || !phoneNumberId || !accessToken) {
    throw new Error(
      'Falta configurar WHATSAPP_API_VERSION, WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN.',
    );
  }

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, ...message }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `WhatsApp Cloud API respondió ${response.status}: ${details.slice(0, 1000)}`,
    );
  }

  return response.json();
}

export function sendText(to, body) {
  return send(to, { type: 'text', text: { body } });
}

export function sendButtons(to, body, buttons) {
  if (buttons.length < 1 || buttons.length > 3) {
    throw new RangeError('WhatsApp permite entre uno y tres botones de respuesta.');
  }

  return send(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map(({ id, title }) => ({
          type: 'reply',
          reply: { id, title: title.slice(0, 20) },
        })),
      },
    },
  });
}

export function sendImage(to, imageUrl, caption) {
  return send(to, {
    type: 'image',
    image: { link: imageUrl, caption },
  });
}

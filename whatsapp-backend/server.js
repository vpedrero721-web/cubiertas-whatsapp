import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import {
  enqueueWebhookMessages,
  getQueueSummary,
  initializeStorage,
} from './src/storage.js';
import { startWebhookWorker } from './src/worker.js';

const port = Number(process.env.PORT ?? 3000);
const appSecret = process.env.META_APP_SECRET;
const verifyToken = process.env.META_VERIFY_TOKEN;
const maxBodyBytes = 1_000_000;

function sendTextResponse(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(body);
}

function verifySignature(rawBody, signatureHeader) {
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const received = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function readBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBodyBytes) {
      throw new RangeError('Webhook request body exceeds the 1 MB limit.');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health' && request.method === 'GET') {
    try {
      const queue = await getQueueSummary();
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ status: 'ok', queue }));
    } catch (error) {
      console.error('Health check failed:', error.message);
      sendTextResponse(response, 503, 'Service unavailable');
    }
    return;
  }

  if (url.pathname !== '/webhook') {
    sendTextResponse(response, 404, 'Not found');
    return;
  }

  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && verifyToken && token === verifyToken && challenge) {
      sendTextResponse(response, 200, challenge);
    } else {
      sendTextResponse(response, 403, 'Webhook verification failed');
    }
    return;
  }

  if (request.method !== 'POST') {
    sendTextResponse(response, 405, 'Method not allowed');
    return;
  }

  try {
    const rawBody = await readBody(request);
    if (!verifySignature(rawBody, request.headers['x-hub-signature-256'])) {
      sendTextResponse(response, 401, 'Invalid webhook signature');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      sendTextResponse(response, 400, 'Invalid JSON payload');
      return;
    }

    if (payload.object !== 'whatsapp_business_account') {
      sendTextResponse(response, 404, 'Unsupported webhook object');
      return;
    }

    await enqueueWebhookMessages(payload);
    sendTextResponse(response, 200, 'EVENT_RECEIVED');
  } catch (error) {
    if (error instanceof RangeError) {
      sendTextResponse(response, 413, error.message);
      return;
    }
    console.error('Webhook request failed:', error.message);
    sendTextResponse(response, 500, 'Internal server error');
  }
});

await initializeStorage();
startWebhookWorker();

server.listen(port, () => {
  console.log(`WhatsApp webhook listening on port ${port}`);
});

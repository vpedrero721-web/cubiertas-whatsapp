import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'cubiertas-bot-'));
process.env.STORAGE_FILE = join(temporaryDirectory, 'state.json');
process.env.WHATSAPP_API_VERSION = 'v23.0';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-number';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
process.env.QUOTES_ENABLED = 'true';

const sentMessages = [];
globalThis.fetch = async (_url, init) => {
  sentMessages.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ messages: [{ id: 'mock-message' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const storage = await import('../src/storage.js');
const { handleIncomingMessage } = await import('../src/bot.js');

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test('persists and deduplicates WhatsApp messages', async () => {
  await storage.initializeStorage();
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.test.1',
                  from: '56900000000',
                  type: 'text',
                  text: { body: 'hola' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  assert.equal(await storage.enqueueWebhookMessages(payload), 1);
  assert.equal(await storage.enqueueWebhookMessages(payload), 0);

  const event = await storage.getNextPendingEvent();
  assert.equal(event.input, 'hola');
  assert.equal(await storage.markEventProcessing(event.id), true);
  await storage.markEventProcessed(event.id);
  await storage.initializeStorage();
  assert.equal(await storage.getNextPendingEvent(), null);
});

test('completes a quote and retains the conversation between restarts', async () => {
  const phone = '56900000001';
  for (const input of [
    '1',
    'product:mdf-blanco',
    '2,4',
    '1',
    '2',
    '1',
  ]) {
    await handleIncomingMessage(phone, input);
  }

  const quoteMessage = sentMessages
    .map((message) => message.text?.body ?? '')
    .find((body) => body.includes('PRE-COTIZACIÓN REFERENCIAL'));
  assert.ok(quoteMessage);
  assert.match(quoteMessage, /115\.976/);
  assert.match(quoteMessage, /Válida hasta:/);

  await storage.initializeStorage();
  assert.equal((await storage.loadSession(phone)).step, 'quote');
});

test('does not expose demonstration prices while quotes are disabled', async () => {
  process.env.QUOTES_ENABLED = 'false';
  const phone = '56900000002';
  const previousCount = sentMessages.length;

  await handleIncomingMessage(phone, '1');

  const response = sentMessages
    .slice(previousCount)
    .map((message) => message.interactive?.body?.text ?? message.text?.body ?? '')
    .join('\n');
  assert.match(response, /confirma sus precios/i);
  assert.doesNotMatch(response, /39990|44990|46990/);
  assert.equal((await storage.loadSession(phone)).step, 'menu');
});

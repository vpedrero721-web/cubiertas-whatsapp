import { handleIncomingMessage } from './bot.js';
import {
  getNextPendingEvent,
  markEventFailed,
  markEventProcessed,
  markEventProcessing,
} from './storage.js';

const phoneLocks = new Map();
let running = false;

async function processNextEvent() {
  const event = await getNextPendingEvent();
  if (!event) return false;
  if (!(await markEventProcessing(event.id))) return true;

  const previous = phoneLocks.get(event.phone) ?? Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => handleIncomingMessage(event.phone, event.input));
  phoneLocks.set(event.phone, current);

  try {
    await current;
    await markEventProcessed(event.id);
  } catch (error) {
    console.error(`Failed to process WhatsApp message ${event.id}:`, error.message);
    await markEventFailed(event.id, error.message);
  } finally {
    if (phoneLocks.get(event.phone) === current) phoneLocks.delete(event.phone);
  }
  return true;
}

export function startWebhookWorker() {
  if (running) return;
  running = true;

  const run = async () => {
    while (running) {
      try {
        const processed = await processNextEvent();
        if (!processed) await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Webhook queue worker failed:', error.message);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  void run();
}

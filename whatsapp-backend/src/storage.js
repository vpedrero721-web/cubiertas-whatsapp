import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const storagePath = resolve(process.env.STORAGE_FILE ?? './data/bot-state.json');
const retentionMs = 30 * 24 * 60 * 60 * 1000;
let state;
let writeChain = Promise.resolve();
let temporaryFileIndex = 0;

function createEmptyState() {
  return { version: 1, sessions: {}, events: {} };
}

async function persist() {
  const snapshot = JSON.stringify(state);
  const temporaryPath = `${storagePath}.${process.pid}.${temporaryFileIndex++}.tmp`;
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await mkdir(dirname(storagePath), { recursive: true });
      await writeFile(temporaryPath, snapshot, { encoding: 'utf8', mode: 0o600 });
      await rename(temporaryPath, storagePath);
    });
  return writeChain;
}

export async function initializeStorage() {
  try {
    const contents = await readFile(storagePath, 'utf8');
    const savedState = JSON.parse(contents);
    if (
      savedState.version !== 1 ||
      typeof savedState.sessions !== 'object' ||
      typeof savedState.events !== 'object'
    ) {
      throw new Error(`Unsupported or invalid storage format in ${storagePath}.`);
    }

    state = savedState;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Unable to load bot storage at ${storagePath}: ${error.message}`);
    }
    state = createEmptyState();
  }

  const cutoff = Date.now() - retentionMs;
  for (const [phone, session] of Object.entries(state.sessions)) {
    if (!session.updatedAt || session.updatedAt < cutoff) delete state.sessions[phone];
  }
  for (const [id, event] of Object.entries(state.events)) {
    if (event.status === 'processing') event.status = 'pending';
    const timestamp = event.completedAt ?? event.receivedAt;
    if (!timestamp || timestamp < cutoff) delete state.events[id];
  }

  await persist();
}

function ensureInitialized() {
  if (!state) throw new Error('Bot storage has not been initialized.');
}

export async function loadSession(phone) {
  ensureInitialized();
  return state.sessions[phone] ?? { step: 'menu' };
}

export async function saveSession(phone, session) {
  ensureInitialized();
  state.sessions[phone] = { ...session, updatedAt: Date.now() };
  await persist();
}

export async function enqueueWebhookMessages(payload) {
  ensureInitialized();
  let added = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (!message.id || !message.from) continue;
        if (state.events[message.id]) continue;

        const input =
          message.type === 'text'
            ? (message.text?.body ?? '')
            : (message.interactive?.button_reply?.id ??
              message.interactive?.list_reply?.id ??
              '');
        state.events[message.id] = {
          id: message.id,
          phone: message.from,
          input,
          status: 'pending',
          attempts: 0,
          receivedAt: Date.now(),
          nextAttemptAt: Date.now(),
        };
        added += 1;
      }
    }
  }

  if (added) await persist();
  return added;
}

export async function getNextPendingEvent() {
  ensureInitialized();
  const now = Date.now();
  return (
    Object.values(state.events).find(
      (event) => event.status === 'pending' && event.nextAttemptAt <= now,
    ) ?? null
  );
}

export async function markEventProcessing(id) {
  ensureInitialized();
  const event = state.events[id];
  if (!event || event.status !== 'pending') return false;
  event.status = 'processing';
  event.attempts += 1;
  await persist();
  return true;
}

export async function markEventProcessed(id) {
  ensureInitialized();
  const event = state.events[id];
  if (!event) return;
  event.status = 'processed';
  event.completedAt = Date.now();
  delete event.input;
  await persist();
}

export async function markEventFailed(id, error) {
  ensureInitialized();
  const event = state.events[id];
  if (!event) return;
  event.status = event.attempts >= 10 ? 'failed' : 'pending';
  event.nextAttemptAt = Date.now() + Math.min(60_000, 1000 * 2 ** event.attempts);
  event.lastError = error.slice(0, 500);
  await persist();
}

export async function getQueueSummary() {
  ensureInitialized();
  return Object.values(state.events).reduce(
    (summary, event) => {
      summary[event.status] = (summary[event.status] ?? 0) + 1;
      return summary;
    },
    {},
  );
}

// Serialize lifecycle changes for one session in this single-process deployment.
// Entries exist only while operations are pending; business queries run outside the lock.
const pending = new Map<string, Promise<void>>();

export async function withSessionLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const previous = pending.get(id) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  pending.set(id, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (pending.get(id) === tail) pending.delete(id);
  }
}

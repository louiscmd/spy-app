// Module-level singleton — persists for the lifetime of the browser tab.
// BluetoothDevice objects can't be serialised, so they live here and are
// shared across client-side route changes (no full-page reload in Next.js).

export type BLEEntry = {
  id: string
  name: string
  rssi: number | null
  angle: number        // fixed position on radar (derived from ID hash)
  distNorm: number     // 0–1 for radar display
  firstSeen: number
  lastSeen: number
  watching: boolean    // true if watchAdvertisements() is active
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  device: any          // BluetoothDevice — typed as any to avoid SSR type errors
}

const store = new Map<string, BLEEntry>()
const listeners = new Set<() => void>()

function notify() { listeners.forEach(fn => fn()) }

export function subscribeToStore(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function registerDevice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  device: any,
  rssi: number | null = null,
  watching = false
): void {
  const id: string = device.id
  const name: string = device.name || `BLE-${id.slice(-4).toUpperCase()}`
  const distNorm =
    rssi !== null
      ? Math.max(0.08, Math.min(0.95, (-rssi - 35) / 65))
      : store.get(id)?.distNorm ?? 0.5

  const existing = store.get(id)
  if (existing) {
    store.set(id, {
      ...existing,
      rssi,
      distNorm,
      lastSeen: Date.now(),
      watching: watching || existing.watching,
    })
  } else {
    const angle = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360
    store.set(id, {
      id, name, rssi, angle, distNorm,
      firstSeen: Date.now(), lastSeen: Date.now(),
      watching, device,
    })
  }
  notify()
}

export function markWatching(id: string): void {
  const e = store.get(id)
  if (e) { store.set(id, { ...e, watching: true }); notify() }
}

export function getEntry(id: string): BLEEntry | undefined {
  return store.get(id)
}

export function getAllEntries(): BLEEntry[] {
  return [...store.values()]
}

export function clearStore(): void {
  store.clear()
  notify()
}

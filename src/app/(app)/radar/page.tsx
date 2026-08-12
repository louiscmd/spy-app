"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  registerDevice, getAllEntries, subscribeToStore, clearStore,
  type BLEEntry,
} from "@/lib/bt-store"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAge(ms: number) {
  const s = Math.floor(ms / 1000)
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`
}

function rssiToDistance(rssi: number) {
  return Math.round(Math.pow(10, (-rssi - 59) / 20) * 10) / 10
}

// Detect what the browser/OS actually supports.
// iOS (any browser) has no Web Bluetooth — Apple's WebKit doesn't implement it.
// Chrome on desktop/Android does. Safari on Mac does not.
type Platform = "chrome-desktop" | "chrome-android" | "ios" | "safari-mac" | "unsupported" | null

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  const hasBluetooth = "bluetooth" in navigator
  if (/iP(hone|ad|od)/.test(ua)) return "ios"
  if (/Android/.test(ua) && hasBluetooth) return "chrome-android"
  if (/Android/.test(ua)) return "unsupported"
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua)) return "safari-mac"
  if (hasBluetooth) return "chrome-desktop"
  return "unsupported"
}

// ─── iOS banner — shown instead of scan controls ─────────────────────────────

function IOSUnsupportedBanner() {
  return (
    <div className="card p-6 border-yellow-900/40 bg-yellow-950/10">
      <div className="flex gap-3">
        <span className="text-yellow-500 text-lg shrink-0">⚠</span>
        <div>
          <p className="text-sm font-medium text-yellow-400 mb-2">
            Bluetooth scanning not available on iPhone
          </p>
          <p className="text-xs text-yellow-700 leading-relaxed mb-3">
            Apple does not allow any browser on iOS to access Bluetooth LE scanning — this is an
            iOS platform restriction, not a bug in the app.
          </p>
          <p className="text-xs text-gray-500 font-medium mb-1">Use instead:</p>
          <ul className="text-xs text-gray-600 space-y-1 list-none">
            <li>◉ Chrome on a Windows or Mac computer</li>
            <li>◉ Chrome on an Android phone</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function SafariUnsupportedBanner() {
  return (
    <div className="card p-5 border-yellow-900/40 bg-yellow-950/10">
      <div className="flex gap-3">
        <span className="text-yellow-500 shrink-0">⚠</span>
        <p className="text-xs text-yellow-700 leading-relaxed">
          Safari on Mac does not support Web Bluetooth. Open this page in{" "}
          <strong className="text-yellow-500">Chrome</strong> to use the scanner.
        </p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RadarPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<BLEEntry[]>([])
  const [picking, setPicking] = useState(false)
  const [scanAngle, setScanAngle] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState("")
  const [platform, setPlatform] = useState<Platform>(null)

  const animRef = useRef<number>(0)
  const watchingRef = useRef<Set<string>>(new Set())

  // Detect platform on mount (needs browser APIs, can't run on server)
  useEffect(() => { setPlatform(detectPlatform()) }, [])

  // Sync devices from store
  useEffect(() => {
    setDevices(getAllEntries())
    return subscribeToStore(() => setDevices(getAllEntries()))
  }, [])

  // Tick "last seen" every second
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Radar sweep animation — only while picking or devices are visible
  useEffect(() => {
    if (devices.length === 0 && !picking) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const tick = () => {
      setScanAngle(a => (a + 1.5) % 360)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [devices.length, picking])

  function addLog(msg: string) {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 29)])
  }

  // ── Pick device via Chrome's native BLE dialog ────────────────────────────
  async function pickDevice() {
    setError("")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any
    if (!nav.bluetooth) return

    setPicking(true)
    addLog("Opening Bluetooth device picker…")
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [],
      })
      const name: string = device.name || `BLE-${device.id.slice(-4).toUpperCase()}`
      addLog(`✓ Selected: ${name}`)
      registerDevice(device, null)

      // Try live RSSI via watchAdvertisements (may need Chrome flag on desktop)
      if (!watchingRef.current.has(device.id)) {
        try {
          await device.watchAdvertisements()
          watchingRef.current.add(device.id)
          addLog(`Live RSSI active for ${name}`)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          device.addEventListener("advertisementreceived", (ev: any) => {
            registerDevice(device, ev.rssi ?? null, true)
          })
        } catch (watchErr: unknown) {
          const msg = watchErr instanceof Error ? watchErr.message : String(watchErr)
          addLog(`No live RSSI: ${msg}`)
          if (platform === "chrome-desktop") {
            addLog("→ chrome://flags → #enable-web-bluetooth-new-permissions-backend")
          }
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      if (e.name === "NotFoundError" || e.message?.toLowerCase().includes("cancel")) {
        addLog("Picker closed — no device selected")
      } else {
        const msg = e.message ?? String(err)
        addLog(`Error: ${msg}`)
        setError(msg)
      }
    } finally {
      setPicking(false)
    }
  }

  // ── Radar geometry ────────────────────────────────────────────────────────
  const cx = 160, cy = 160, r = 140
  const STALE_MS = 120_000
  const FADE_MS = 30_000
  const canScan = platform === "chrome-desktop" || platform === "chrome-android"
  const visible = devices.filter(d => now - d.lastSeen < STALE_MS)

  function blipPos(angle: number, dist: number) {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: cx + dist * r * Math.cos(rad), y: cy + dist * r * Math.sin(rad) }
  }

  return (
    <div className="p-6 max-w-5xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Bluetooth Scanner</p>
      <h1 className="text-xl font-semibold text-gray-100 mb-1">Proximity Radar</h1>
      <p className="text-xs text-gray-600 mb-6">
        {canScan
          ? "Chrome opens a native picker — select any nearby Bluetooth device to add it."
          : "Detects nearby Bluetooth LE devices."}
      </p>

      {/* iOS / Safari banners — full-width above the grid */}
      {platform === "ios" && <IOSUnsupportedBanner />}
      {platform === "safari-mac" && <SafariUnsupportedBanner />}

      {/* Main grid — always visible so iOS users still see the UI */}
      <div className={`grid md:grid-cols-3 gap-6 ${platform === "ios" || platform === "safari-mac" ? "mt-6 opacity-40 pointer-events-none select-none" : ""}`}>

        {/* ── Radar canvas ── */}
        <div className="card p-4">
          <svg
            viewBox="0 0 320 320"
            className="w-full aspect-square bg-[#010a01] rounded-lg overflow-hidden"
          >
            {[1, 0.75, 0.5, 0.25].map((d, i) => (
              <circle key={i} cx={cx} cy={cy} r={r * d} fill="none" stroke="#0a2a0a" strokeWidth={0.5} />
            ))}
            <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#0a2a0a" strokeWidth={0.5} />
            <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#0a2a0a" strokeWidth={0.5} />

            {(picking || visible.length > 0) && (() => {
              const rad = ((scanAngle - 90) * Math.PI) / 180
              const x2 = cx + r * Math.cos(rad), y2 = cy + r * Math.sin(rad)
              const trailRad = ((scanAngle - 60 - 90) * Math.PI) / 180
              return (
                <>
                  <defs>
                    <radialGradient id="sg">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <path
                    d={`M ${cx} ${cy} L ${cx + r * Math.cos(trailRad)} ${cy + r * Math.sin(trailRad)} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                    fill="url(#sg)" opacity={0.15}
                  />
                  <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#22c55e" strokeWidth={1.5} opacity={0.9} />
                </>
              )
            })()}

            {visible.map(dev => {
              const { x, y } = blipPos(dev.angle, dev.distNorm)
              const age = now - dev.lastSeen
              const opacity = age < FADE_MS ? 1 : Math.max(0.15, 1 - (age - FADE_MS) / (STALE_MS - FADE_MS))
              return (
                <g
                  key={dev.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/tracker/${encodeURIComponent(dev.id)}?name=${encodeURIComponent(dev.name)}`)}
                >
                  <circle cx={x} cy={y} r={14} fill="transparent" />
                  <circle cx={x} cy={y} r={5} fill={dev.rssi !== null ? "#22c55e" : "#4ade80"} opacity={opacity} />
                  <circle cx={x} cy={y} r={11} fill="none" stroke="#22c55e" strokeWidth={0.5} opacity={opacity * 0.35} />
                  <text x={x + 9} y={y - 2} fontSize={7} fill="#22c55e" opacity={opacity * 0.9}>{dev.name.slice(0, 14)}</text>
                  {dev.rssi !== null && (
                    <text x={x + 9} y={y + 7} fontSize={6} fill="#166534" opacity={opacity * 0.7}>{dev.rssi} dBm</text>
                  )}
                </g>
              )
            })}

            <circle cx={cx} cy={cy} r={3} fill="#22c55e" opacity={0.9} />
            <text x={cx} y={cy + r + 16} textAnchor="middle" fontSize={7} fill="#1a4a1a" letterSpacing={2}>BT LE SCANNER</text>
          </svg>

          <div className="mt-3 space-y-2">
            <button
              onClick={pickDevice}
              disabled={picking || !canScan}
              className="btn btn-silver w-full justify-center text-xs uppercase tracking-wider disabled:opacity-30"
            >
              {picking ? "⟳ Opening picker…" : "◌  Add Device"}
            </button>
            {devices.length > 0 && (
              <button
                onClick={() => { clearStore(); watchingRef.current.clear() }}
                className="btn btn-ghost w-full justify-center text-xs uppercase tracking-wider"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className={canScan ? "text-green-500" : "text-red-500"}>{canScan ? "✓" : "✗"}</span>
              <span className="text-gray-700">
                {platform === "chrome-desktop" && "Chrome desktop — ready"}
                {platform === "chrome-android" && "Chrome Android — ready"}
                {platform === "ios" && "iOS — BLE not supported"}
                {platform === "safari-mac" && "Safari — open in Chrome"}
                {platform === "unsupported" && "Browser not supported"}
                {platform === null && "Detecting…"}
              </span>
            </div>
            {error && <p className="text-red-400 text-[11px]">{error}</p>}
            {platform === "chrome-desktop" && (
              <p className="text-gray-800 text-[10px] leading-relaxed">
                For live RSSI: <span className="font-mono">chrome://flags → #enable-web-bluetooth-new-permissions-backend</span>
              </p>
            )}
          </div>
        </div>

        {/* ── Device list + log ── */}
        <div className="md:col-span-2 space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs text-gray-600 uppercase tracking-wider">Devices ({visible.length})</h2>
              {visible.length > 0 && <p className="text-[10px] text-gray-700">Tap row to track</p>}
            </div>

            {visible.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-700 mb-3">No devices added yet.</p>
                {canScan && (
                  <button
                    onClick={pickDevice}
                    disabled={picking}
                    className="btn btn-silver text-xs px-4 py-2 uppercase tracking-wider"
                  >
                    {picking ? "Opening…" : "Add Device"}
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-700 border-b border-[#1a1a1a]">
                      <th className="text-left pb-2 font-normal">Device</th>
                      <th className="text-right pb-2 font-normal">RSSI</th>
                      <th className="text-right pb-2 font-normal">~Distance</th>
                      <th className="text-right pb-2 font-normal">Last seen</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...visible].sort((a, b) => b.lastSeen - a.lastSeen).map(d => {
                      const age = now - d.lastSeen
                      const fresh = age < 8000
                      const distM = d.rssi !== null ? rssiToDistance(d.rssi) : null
                      return (
                        <tr
                          key={d.id}
                          className="border-b border-[#111] last:border-0 hover:bg-[#0a0a0a] active:bg-[#111] transition-colors group cursor-pointer"
                          onClick={() => router.push(`/tracker/${encodeURIComponent(d.id)}?name=${encodeURIComponent(d.name)}`)}
                        >
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${fresh ? "bg-green-400" : "bg-gray-700"}`} />
                              <div>
                                <p className={fresh ? "text-gray-200" : "text-gray-600"}>{d.name}</p>
                                {d.watching && <p className="text-[10px] text-green-900">live RSSI</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-mono text-gray-500">{d.rssi !== null ? `${d.rssi} dBm` : "—"}</td>
                          <td className="py-2.5 text-right text-gray-600">{distM !== null ? `~${distM}m` : "—"}</td>
                          <td className="py-2.5 text-right text-gray-700">{fmtAge(age)}</td>
                          <td className="py-2.5 pl-3">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-green-600 border border-green-900 rounded px-2 py-0.5 whitespace-nowrap">
                              Track →
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-xs text-gray-600 uppercase tracking-wider mb-2">Log</h2>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {log.length === 0
                ? <p className="text-xs text-gray-700">Press "Add Device" to open the Bluetooth picker.</p>
                : log.map((l, i) => <p key={i} className="text-[11px] text-green-900 font-mono leading-relaxed">{l}</p>)
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

type Device = {
  id: string
  name: string
  rssi: number
  angle: number   // fixed on first sight, for radar position
  distance: number
  firstSeen: number
  lastSeen: number
}

export default function RadarPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<Map<string, Device>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [isHttps, setIsHttps] = useState(true)
  const [demoMode, setDemoMode] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [scanAngle, setScanAngle] = useState(0)
  const [now, setNow] = useState(Date.now())

  const animRef = useRef<number>(0)
  const demoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bleRef = useRef<{ stop: () => void } | null>(null)
  const navRef = useRef<Record<string, unknown> | null>(null)

  // Update "now" every second so lastSeen ages are live
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setSupported("bluetooth" in (navigator as unknown as Record<string, unknown>))
    setIsHttps(location.protocol === "https:" || location.hostname === "localhost")
  }, [])

  // Radar sweep animation
  useEffect(() => {
    if (!scanning) { cancelAnimationFrame(animRef.current); return }
    const tick = () => {
      setScanAngle(a => (a + 1.5) % 360)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [scanning])

  const addLog = useCallback((msg: string) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)])
  }, [])

  const upsertDevice = useCallback((id: string, name: string, rssi: number) => {
    const distance = Math.max(0.08, Math.min(0.95, (-rssi - 35) / 65))
    setDevices(prev => {
      const next = new Map(prev)
      const existing = next.get(id)
      if (existing) {
        next.set(id, { ...existing, rssi, distance, lastSeen: Date.now() })
      } else {
        // Assign a stable angle derived from the ID string
        const angle = (id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 360
        next.set(id, { id, name, rssi, angle, distance, firstSeen: Date.now(), lastSeen: Date.now() })
        addLog(`New device: ${name} · ${rssi} dBm`)
      }
      return next
    })
  }, [addLog])

  // Demo device pool
  const DEMO_NAMES = ["Android-4F2A", "iPhone (privacy)", "BLE-9C1B", "Headphones-XB5", "Smartwatch-42", "Laptop-F3D1", "Speaker-B200"]

  function startDemoMode(reason: string) {
    setDemoMode(true)
    addLog(reason)
    let demoId = 0
    demoRef.current = setInterval(() => {
      // Occasionally add new, occasionally re-ping existing
      const shouldRepeat = Math.random() > 0.4
      if (shouldRepeat && demoId > 0) {
        const id = `demo-${Math.floor(Math.random() * demoId)}`
        const rssi = -(Math.floor(Math.random() * 45) + 45)
        upsertDevice(id, DEMO_NAMES[parseInt(id.split("-")[1]) % DEMO_NAMES.length], rssi)
      } else {
        const id = `demo-${demoId++}`
        const rssi = -(Math.floor(Math.random() * 45) + 45)
        upsertDevice(id, DEMO_NAMES[demoId % DEMO_NAMES.length], rssi)
      }
    }, 1500)
  }

  async function startScan() {
    setScanning(true)
    setDemoMode(false)
    setDevices(new Map())
    setLog([])
    addLog("Starting Bluetooth LE scan…")

    if (!supported || !isHttps) {
      startDemoMode(supported
        ? "HTTP detected — HTTPS required for real scan. Running demo."
        : "Web Bluetooth not available in this browser. Running demo.")
      return
    }

    try {
      addLog("Requesting BLE scan permission…")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navRef.current = navigator as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scan = await (navRef.current!.bluetooth as any).requestLEScan({ acceptAllAdvertisements: true })
      bleRef.current = scan
      addLog("✓ BLE scan active — listening for advertisements")

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(navRef.current!.bluetooth as any).addEventListener("advertisementreceived", (event: any) => {
        const id: string = event.device.id
        const name: string = event.device.name || `BLE-${id.slice(-4).toUpperCase()}`
        const rssi: number = event.rssi ?? -75
        upsertDevice(id, name, rssi)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("denied")) {
        addLog("Permission denied — running demo mode instead")
      } else if (msg.includes("requestLEScan") || msg.includes("not implemented")) {
        addLog("requestLEScan() unavailable — enable chrome://flags → #enable-web-bluetooth-new-permissions-backend")
      } else {
        addLog(`BLE error: ${msg}`)
      }
      startDemoMode("Falling back to demo mode")
    }
  }

  function stopScan() {
    setScanning(false)
    setDemoMode(false)
    if (demoRef.current) { clearInterval(demoRef.current); demoRef.current = null }
    if (bleRef.current) { try { bleRef.current.stop() } catch {} bleRef.current = null }
    addLog("Scan stopped")
  }

  const cx = 160, cy = 160, r = 140
  const FADE_MS = 30_000   // blip stays fully bright for 30s, then fades
  const STALE_MS = 120_000 // remove from radar after 2 min of silence

  // Sorted device list for the table
  const deviceList = [...devices.values()]
    .filter(d => now - d.lastSeen < STALE_MS)
    .sort((a, b) => b.lastSeen - a.lastSeen)

  function blipPos(angle: number, dist: number) {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: cx + dist * r * Math.cos(rad), y: cy + dist * r * Math.sin(rad) }
  }

  function fmtAge(ms: number) {
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }

  const canRealScan = supported && isHttps

  return (
    <div className="p-6 max-w-5xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Bluetooth Scanner</p>
      <h1 className="text-xl font-semibold text-gray-100 mb-1">Proximity Radar</h1>
      <p className="text-xs text-gray-600 mb-6">
        Detects nearby Bluetooth LE devices in real time.
        {demoMode && <span className="text-yellow-600 ml-2">Demo mode active</span>}
      </p>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Radar */}
        <div className="card p-4">
          <svg viewBox="0 0 320 320" className="w-full aspect-square bg-[#010a01] rounded-lg overflow-hidden">
            {[1, 0.75, 0.5, 0.25].map((d, i) => (
              <circle key={i} cx={cx} cy={cy} r={r * d} fill="none" stroke="#0a2a0a" strokeWidth={0.5} />
            ))}
            <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#0a2a0a" strokeWidth={0.5} />
            <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#0a2a0a" strokeWidth={0.5} />

            {scanning && (() => {
              const rad = ((scanAngle - 90) * Math.PI) / 180
              const x2 = cx + r * Math.cos(rad), y2 = cy + r * Math.sin(rad)
              const trailRad = ((scanAngle - 60 - 90) * Math.PI) / 180
              return (
                <>
                  <defs>
                    <radialGradient id="sg"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.9"/><stop offset="100%" stopColor="#22c55e" stopOpacity="0"/></radialGradient>
                  </defs>
                  <path d={`M ${cx} ${cy} L ${cx + r * Math.cos(trailRad)} ${cy + r * Math.sin(trailRad)} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`} fill="url(#sg)" opacity={0.18}/>
                  <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#22c55e" strokeWidth={1.5} opacity={0.9}/>
                </>
              )
            })()}

            {deviceList.map(dev => {
              const { x, y } = blipPos(dev.angle, dev.distance)
              const age = now - dev.lastSeen
              const opacity = age < FADE_MS ? 1 : Math.max(0.15, 1 - (age - FADE_MS) / (STALE_MS - FADE_MS))
              return (
                <g key={dev.id} style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/tracker/${encodeURIComponent(dev.id)}?name=${encodeURIComponent(dev.name)}`)}>
                  <circle cx={x} cy={y} r={12} fill="transparent"/>
                  <circle cx={x} cy={y} r={5} fill="#22c55e" opacity={opacity}/>
                  <circle cx={x} cy={y} r={10} fill="none" stroke="#22c55e" strokeWidth={0.5} opacity={opacity * 0.4}/>
                  <text x={x + 8} y={y - 3} fontSize={7} fill="#22c55e" opacity={opacity * 0.85}>{dev.name.slice(0, 14)}</text>
                  <text x={x + 8} y={y + 6} fontSize={6} fill="#166534" opacity={opacity * 0.7}>{dev.rssi} dBm</text>
                </g>
              )
            })}

            <circle cx={cx} cy={cy} r={3} fill="#22c55e" opacity={0.9}/>
            <text x={cx} y={cx + r + 16} textAnchor="middle" fontSize={7} fill="#1a4a1a" letterSpacing={2}>BT LE SCANNER</text>
          </svg>

          <div className="mt-3">
            {!scanning ? (
              <button onClick={startScan} className="btn btn-silver w-full justify-center text-xs uppercase tracking-wider">◌ Start Scan</button>
            ) : (
              <button onClick={stopScan} className="btn btn-danger w-full justify-center text-xs uppercase tracking-wider">⊗ Stop</button>
            )}
          </div>

          {/* Requirements */}
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className={supported ? "text-green-500" : "text-red-500"}>{supported ? "✓" : "✗"}</span>
              <span className="text-gray-700">Chrome desktop or Android</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={isHttps ? "text-green-500" : "text-yellow-500"}>{isHttps ? "✓" : "!"}</span>
              <span className={isHttps ? "text-gray-700" : "text-yellow-700"}>HTTPS {!isHttps && "(required)"}</span>
            </div>
            {canRealScan && (
              <p className="text-gray-800 text-[10px] pt-1">If scan fails: <span className="font-mono">chrome://flags → #enable-web-bluetooth-new-permissions-backend</span></p>
            )}
          </div>
        </div>

        {/* Device table — spans 2 columns */}
        <div className="md:col-span-2 space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs text-gray-600 uppercase tracking-wider">Detected Devices ({deviceList.length})</h2>
              {deviceList.length > 0 && (
                <button onClick={() => setDevices(new Map())} className="text-[10px] text-gray-700 hover:text-gray-500">Clear</button>
              )}
            </div>
            {deviceList.length === 0 ? (
              <p className="text-xs text-gray-700 py-6 text-center">No devices detected yet. Start scanning.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-700 border-b border-[#1a1a1a]">
                      <th className="text-left pb-2 font-normal">Device</th>
                      <th className="text-right pb-2 font-normal">RSSI</th>
                      <th className="text-right pb-2 font-normal">~Distance</th>
                      <th className="text-right pb-2 font-normal">Last seen</th>
                      <th className="pb-2"/>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceList.map(d => {
                      const age = now - d.lastSeen
                      const fresh = age < 5000
                      const distM = Math.round(Math.pow(10, (-d.rssi - 59) / (10 * 2)) * 10) / 10
                      return (
                        <tr key={d.id} className="border-b border-[#111] last:border-0 hover:bg-[#0a0a0a] transition-colors group">
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${fresh ? "bg-green-400" : "bg-gray-700"}`}/>
                              <span className={fresh ? "text-gray-300" : "text-gray-600"}>{d.name}</span>
                            </div>
                          </td>
                          <td className="py-2 text-right font-mono text-gray-500">{d.rssi} dBm</td>
                          <td className="py-2 text-right text-gray-600">~{distM}m</td>
                          <td className="py-2 text-right text-gray-700">{fmtAge(age)}</td>
                          <td className="py-2 pl-3">
                            <button
                              onClick={() => router.push(`/tracker/${encodeURIComponent(d.id)}?name=${encodeURIComponent(d.name)}`)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-green-600 hover:text-green-400 border border-green-900 hover:border-green-700 rounded px-2 py-0.5 whitespace-nowrap"
                            >
                              Track →
                            </button>
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
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {log.length === 0
                ? <p className="text-xs text-gray-700">Awaiting scan…</p>
                : log.map((l, i) => <p key={i} className="text-[11px] text-green-900 font-mono leading-relaxed">{l}</p>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

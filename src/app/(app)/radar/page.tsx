"use client"
import { useState, useEffect, useRef } from "react"

type BlipType = { id: string; angle: number; distance: number; name: string; rssi?: number; age: number }

export default function RadarPage() {
  const [blips, setBlips] = useState<BlipType[]>([])
  const [scanning, setScanning] = useState(false)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [isHttps, setIsHttps] = useState(true)
  const [log, setLog] = useState<string[]>([])
  const [scanAngle, setScanAngle] = useState(0)
  const [demoMode, setDemoMode] = useState(false)
  const animRef = useRef<number>(0)
  const scanRef = useRef<number>(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bleRef = useRef<any>(null)

  useEffect(() => {
    setSupported("bluetooth" in (navigator as unknown as Record<string, unknown>))
    setIsHttps(location.protocol === "https:" || location.hostname === "localhost")
  }, [])

  // Animate radar sweep
  useEffect(() => {
    if (!scanning) return
    const tick = () => {
      setScanAngle(a => (a + 1.5) % 360)
      setBlips(prev => prev.map(b => ({ ...b, age: b.age + 1 })).filter(b => b.age < 200))
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [scanning])

  function addLog(msg: string) {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 29)])
  }

  function addDemoBlip() {
    const names = ["Android-4F2A", "iPhone-??", "Unknown BLE", "Headphones-X", "Device-9C1B", "Smartwatch-3A"]
    const newBlip: BlipType = {
      id: Math.random().toString(36).slice(2),
      angle: Math.random() * 360,
      distance: 0.2 + Math.random() * 0.75,
      name: names[Math.floor(Math.random() * names.length)],
      rssi: -(Math.floor(Math.random() * 50) + 40),
      age: 0,
    }
    setBlips(prev => [...prev.slice(-15), newBlip])
    addLog(`Device detected: ${newBlip.name} (${newBlip.rssi} dBm)`)
  }

  async function startScan() {
    setScanning(true)
    setDemoMode(false)
    addLog("Starting Bluetooth scan…")

    if (!supported || !isHttps) {
      setDemoMode(true)
      addLog(supported ? "HTTP detected — demo mode (HTTPS required for real scan)" : "Web Bluetooth not supported — demo mode")
      const interval = setInterval(addDemoBlip, 1800)
      scanRef.current = interval as unknown as number
      return
    }

    try {
      addLog("Requesting BLE scan permission…")
      // requestLEScan is a Chrome-only experimental API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any
      const scan = await nav.bluetooth.requestLEScan({ acceptAllAdvertisements: true })
      bleRef.current = scan
      addLog("✓ BLE scan active — detecting nearby devices")

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nav.bluetooth.addEventListener("advertisementreceived", (event: any) => {
        const id = event.device.id
        const name = event.device.name || `BLE-${id.slice(-4).toUpperCase()}`
        const rssi = event.rssi ?? -70
        // Estimate distance from RSSI: closer = lower index = higher RSSI
        const distance = Math.max(0.08, Math.min(0.95, (-rssi - 35) / 65))
        const angle = (parseInt(id.replace(/\D/g, "").slice(-3) || "0") % 360)
        setBlips(prev => {
          const existing = prev.findIndex(b => b.id === id)
          if (existing >= 0) {
            const next = [...prev]
            next[existing] = { ...next[existing], age: 0, rssi, distance }
            return next
          }
          addLog(`New device: ${name} · ${rssi} dBm`)
          return [...prev.slice(-20), { id, angle, distance, name, rssi, age: 0 }]
        })
      })

      setTimeout(() => { stopScan() }, 60000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("User cancelled")) {
        addLog("Permission denied — switching to demo mode")
      } else if (msg.includes("requestLEScan")) {
        addLog("requestLEScan unavailable — enable chrome://flags/#enable-web-bluetooth-new-permissions-backend")
      } else {
        addLog(`Error: ${msg}`)
      }
      setDemoMode(true)
      const interval = setInterval(addDemoBlip, 1800)
      scanRef.current = interval as unknown as number
    }
  }

  function stopScan() {
    setScanning(false)
    setDemoMode(false)
    clearInterval(scanRef.current)
    if (bleRef.current) { try { bleRef.current.stop() } catch {} bleRef.current = null }
    addLog("Scan stopped")
  }

  const cx = 160, cy = 160, r = 140

  function blipPos(angle: number, dist: number) {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: cx + dist * r * Math.cos(rad), y: cy + dist * r * Math.sin(rad) }
  }

  const canRealScan = supported && isHttps

  return (
    <div className="p-6 max-w-4xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Bluetooth Scanner</p>
      <h1 className="text-xl font-semibold text-gray-100 mb-1">Proximity Radar</h1>
      <p className="text-xs text-gray-600 mb-6">
        Detects nearby Bluetooth LE devices in real time.
        {demoMode && <span className="text-yellow-600 ml-1">— Demo mode active</span>}
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Radar display */}
        <div className="card p-4">
          <svg viewBox="0 0 320 320" className="w-full aspect-square bg-[#010a01] rounded-lg overflow-hidden">
            {[1, 0.75, 0.5, 0.25].map((d, i) => (
              <circle key={i} cx={cx} cy={cy} r={r * d} fill="none" stroke="#0a2a0a" strokeWidth={0.5} />
            ))}
            <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#0a2a0a" strokeWidth={0.5} />
            <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#0a2a0a" strokeWidth={0.5} />

            {scanning && (() => {
              const sweepRad = ((scanAngle - 90) * Math.PI) / 180
              const x2 = cx + r * Math.cos(sweepRad)
              const y2 = cy + r * Math.sin(sweepRad)
              return (
                <>
                  <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#22c55e" strokeWidth={1.5} opacity={0.8} />
                  <path d={`M ${cx} ${cy} L ${cx + r * Math.cos(((scanAngle - 60 - 90) * Math.PI) / 180)} ${cy + r * Math.sin(((scanAngle - 60 - 90) * Math.PI) / 180)} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                    fill="url(#sweep-grad)" opacity={0.15} />
                  <defs>
                    <radialGradient id="sweep-grad">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                </>
              )
            })()}

            {blips.map(blip => {
              const { x, y } = blipPos(blip.angle, blip.distance)
              const opacity = Math.max(0.1, 1 - blip.age / 200)
              return (
                <g key={blip.id}>
                  <circle cx={x} cy={y} r={4} fill="#22c55e" opacity={opacity} />
                  <circle cx={x} cy={y} r={9} fill="none" stroke="#22c55e" strokeWidth={0.5} opacity={opacity * 0.4} />
                  <text x={x + 7} y={y - 4} fontSize={8} fill="#22c55e" opacity={opacity * 0.8}>{blip.name.slice(0, 14)}</text>
                </g>
              )
            })}

            <circle cx={cx} cy={cy} r={3} fill="#22c55e" opacity={0.8} />
            <text x={cx} y={cx + r + 16} textAnchor="middle" fontSize={7} fill="#1a4a1a" letterSpacing={2}>
              BT LE SCANNER
            </text>
          </svg>

          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <button onClick={startScan} className="btn btn-silver flex-1 justify-center text-xs uppercase tracking-wider">
                ◌ Start Scan
              </button>
            ) : (
              <button onClick={stopScan} className="btn btn-danger flex-1 justify-center text-xs uppercase tracking-wider">
                ⊗ Stop
              </button>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="text-xs text-gray-600 uppercase tracking-wider mb-3">Detected Devices ({blips.length})</h2>
            {blips.length === 0 ? (
              <p className="text-xs text-gray-700 py-4 text-center">No devices detected. Start scanning.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {blips.map(b => (
                  <div key={b.id} className="flex items-center justify-between text-xs py-1.5 border-b border-[#1a1a1a]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" style={{ opacity: Math.max(0.2, 1 - b.age / 200) }} />
                      <span className="text-gray-400">{b.name}</span>
                    </div>
                    {b.rssi && <span className="text-gray-700 font-mono">{b.rssi} dBm</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-xs text-gray-600 uppercase tracking-wider mb-2">Scan Log</h2>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {log.length === 0 ? (
                <p className="text-xs text-gray-700">Awaiting scan…</p>
              ) : log.map((l, i) => (
                <p key={i} className="text-xs text-green-900 font-mono leading-relaxed">{l}</p>
              ))}
            </div>
          </div>

          {/* Requirements box */}
          <div className={`card p-4 text-xs space-y-1.5 ${canRealScan ? "border-green-900/30" : "border-yellow-900/30"}`}>
            <p className="font-medium text-gray-500 mb-2 uppercase tracking-wider">Requirements</p>
            <div className="flex items-center gap-2">
              <span className={supported ? "text-green-500" : "text-red-500"}>{supported ? "✓" : "✗"}</span>
              <span className={supported ? "text-gray-500" : "text-gray-600"}>Chrome on desktop or Android</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={isHttps ? "text-green-500" : "text-yellow-500"}>{isHttps ? "✓" : "!"}</span>
              <span className={isHttps ? "text-gray-500" : "text-yellow-700"}>HTTPS connection {!isHttps && "(required for real scan)"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-700">→</span>
              <span className="text-gray-700">Bluetooth enabled on this device</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-700">→</span>
              <span className="text-gray-700">Grant permission when browser asks</span>
            </div>
            {supported && isHttps && (
              <p className="text-gray-700 pt-1 border-t border-[#1a1a1a] mt-2">
                If scan fails: open <span className="font-mono text-gray-600">chrome://flags</span> → enable <span className="font-mono text-gray-600">#enable-web-bluetooth-new-permissions-backend</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

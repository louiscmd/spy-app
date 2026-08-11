"use client"
import { useState, useEffect, useRef } from "react"

type BlipType = { id: string; angle: number; distance: number; name: string; rssi?: number; age: number }

export default function RadarPage() {
  const [blips, setBlips] = useState<BlipType[]>([])
  const [scanning, setScanning] = useState(false)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [scanAngle, setScanAngle] = useState(0)
  const animRef = useRef<number>(0)
  const scanRef = useRef<number>(0)

  useEffect(() => {
    setSupported("bluetooth" in navigator)
  }, [])

  // Animate radar sweep
  useEffect(() => {
    if (!scanning) return
    const tick = () => {
      setScanAngle(a => (a + 1.5) % 360)
      // Age out blips
      setBlips(prev => prev.map(b => ({ ...b, age: b.age + 1 })).filter(b => b.age < 200))
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [scanning])

  function addLog(msg: string) {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)])
  }

  function addDemoBlips() {
    const names = ["SPECTRE-Alpha","Unknown Device","Omega-3","Field Unit 7","Surveillance-X","Vehicle-19"]
    const newBlip: BlipType = {
      id: Math.random().toString(36).slice(2),
      angle: Math.random() * 360,
      distance: 0.2 + Math.random() * 0.75,
      name: names[Math.floor(Math.random() * names.length)],
      rssi: -(Math.floor(Math.random() * 50) + 40),
      age: 0,
    }
    setBlips(prev => [...prev.slice(-15), newBlip])
    addLog(`Signal detected: ${newBlip.name} (${newBlip.rssi} dBm)`)
  }

  async function startScan() {
    setScanning(true)
    addLog("Initialising field scanner…")

    if (!supported) {
      // Demo mode
      addLog("Bluetooth unavailable — running demo mode")
      const interval = setInterval(addDemoBlips, 1800)
      scanRef.current = interval as unknown as number
      return
    }

    try {
      addLog("Requesting Bluetooth scan permission…")
      // @ts-expect-error — experimental API
      const scan = await navigator.bluetooth.requestLEScan({ acceptAllAdvertisements: true })
      addLog("Bluetooth scan active — monitoring for signals")

      // @ts-expect-error
      navigator.bluetooth.addEventListener("advertisementreceived", (event) => {
        const id = event.device.id
        const name = event.device.name || `Unknown-${id.slice(-4)}`
        const rssi = event.rssi ?? -70
        const distance = Math.max(0.1, Math.min(0.95, (-rssi - 40) / 60))
        const angle = (parseInt(id.replace(/[^0-9]/g, "").slice(-3) || "0") % 360)
        setBlips(prev => {
          const existing = prev.findIndex(b => b.id === id)
          if (existing >= 0) {
            const next = [...prev]
            next[existing] = { ...next[existing], age: 0, rssi }
            return next
          }
          addLog(`Signal detected: ${name} (${rssi} dBm)`)
          return [...prev.slice(-15), { id, angle, distance, name, rssi, age: 0 }]
        })
      })

      // Stop after 60s
      setTimeout(() => {
        scan.stop()
        stopScan()
      }, 60000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      addLog(`Scan failed: ${msg} — switching to demo mode`)
      const interval = setInterval(addDemoBlips, 1800)
      scanRef.current = interval as unknown as number
    }
  }

  function stopScan() {
    setScanning(false)
    clearInterval(scanRef.current)
    addLog("Scanner deactivated")
  }

  const cx = 160, cy = 160, r = 140

  function blipPos(angle: number, dist: number) {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: cx + dist * r * Math.cos(rad), y: cy + dist * r * Math.sin(rad) }
  }

  return (
    <div className="p-6 max-w-4xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Q Branch Field Scanner</p>
      <h1 className="text-xl font-semibold text-gray-100 mb-2">Proximity Radar</h1>
      <p className="text-xs text-gray-600 mb-6">
        {supported === false ? "Bluetooth not available — running demo mode" : "Detects nearby Bluetooth LE devices. Requires Chrome + permission."}
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Radar display */}
        <div className="card p-4">
          <svg viewBox="0 0 320 320" className="w-full aspect-square bg-[#010a01] rounded-lg overflow-hidden">
            {/* Background rings */}
            {[1, 0.75, 0.5, 0.25].map((d, i) => (
              <circle key={i} cx={cx} cy={cy} r={r * d} fill="none" stroke="#0a2a0a" strokeWidth={0.5} />
            ))}
            {/* Cross lines */}
            <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#0a2a0a" strokeWidth={0.5} />
            <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#0a2a0a" strokeWidth={0.5} />

            {/* Sweep */}
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

            {/* Blips */}
            {blips.map(blip => {
              const { x, y } = blipPos(blip.angle, blip.distance)
              const opacity = Math.max(0.1, 1 - blip.age / 200)
              return (
                <g key={blip.id}>
                  <circle cx={x} cy={y} r={4} fill="#22c55e" opacity={opacity} />
                  <circle cx={x} cy={y} r={8} fill="none" stroke="#22c55e" strokeWidth={0.5} opacity={opacity * 0.4} />
                  <text x={x + 6} y={y - 4} fontSize={8} fill="#22c55e" opacity={opacity * 0.8}>{blip.name.slice(0, 12)}</text>
                </g>
              )
            })}

            {/* Centre dot */}
            <circle cx={cx} cy={cy} r={3} fill="#22c55e" opacity={0.8} />

            {/* Overlay text */}
            <text x={cx} y={cx + r + 16} textAnchor="middle" fontSize={8} fill="#1a4a1a" letterSpacing={2}>
              MI6 FIELD SCANNER
            </text>
          </svg>

          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <button onClick={startScan} className="btn btn-silver flex-1 justify-center text-xs uppercase tracking-wider">
                ◌ Activate Scanner
              </button>
            ) : (
              <button onClick={stopScan} className="btn btn-danger flex-1 justify-center text-xs uppercase tracking-wider">
                ⊗ Deactivate
              </button>
            )}
          </div>
        </div>

        {/* Signal log + blip list */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="text-xs text-gray-600 uppercase tracking-wider mb-3">Detected Signals ({blips.length})</h2>
            {blips.length === 0 ? (
              <p className="text-xs text-gray-700 py-4 text-center">No signals detected. Activate scanner.</p>
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
            <h2 className="text-xs text-gray-600 uppercase tracking-wider mb-3">Scan Log</h2>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {log.length === 0 ? (
                <p className="text-xs text-gray-700">Awaiting activation…</p>
              ) : (
                log.map((l, i) => <p key={i} className="text-xs text-green-900 font-mono">{l}</p>)
              )}
            </div>
          </div>

          <div className="card p-3 text-xs text-gray-700">
            <p className="font-medium text-gray-600 mb-1">Field notes</p>
            <p>Works on Chrome (desktop + Android). iOS Safari does not support Web Bluetooth. Requires user permission. Detected devices are not identified — only device IDs and signal strength.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

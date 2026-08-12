"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"

// ─── Types ───────────────────────────────────────────────────────────────────

type GeoPos = { lat: number; lon: number; accuracy: number }

type Reading = {
  pos: GeoPos
  rssi: number
  ts: number
}

// ─── Geo utils ───────────────────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function rssiToDistance(rssi: number): number {
  return Math.round(Math.pow(10, (-rssi - 59) / 20) * 10) / 10
}

function rssiToStrength(rssi: number): number {
  // -100 dBm → 0,  -40 dBm → 1
  return Math.max(0, Math.min(1, (rssi + 100) / 60))
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const deviceId = params.id as string
  const deviceName = searchParams.get("name") || `Device ${deviceId.slice(-6).toUpperCase()}`

  const [pos, setPos] = useState<GeoPos | null>(null)
  const [rssi, setRssi] = useState<number | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [scanning, setScanning] = useState(false)
  const [geoStatus, setGeoStatus] = useState<"waiting" | "ok" | "error">("waiting")
  const [geoError, setGeoError] = useState("")
  const [bleError, setBleError] = useState("")
  const [compassHeading, setCompassHeading] = useState<number | null>(null)
  const [pulse, setPulse] = useState(0)
  const [lastSeen, setLastSeen] = useState<number | null>(null)

  const bleRef = useRef<{ stop: () => void } | null>(null)
  const posRef = useRef<GeoPos | null>(null)
  const animRef = useRef<number>(0)

  // Keep posRef in sync so BLE callback has current position
  useEffect(() => { posRef.current = pos }, [pos])

  // ── Pulse animation ─────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      setPulse(p => (p + 2) % 360)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  // ── Geolocation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("error")
      setGeoError("Geolocation not supported in this browser")
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      p => {
        const gp: GeoPos = {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }
        setPos(gp)
        setGeoStatus("ok")
      },
      err => {
        setGeoStatus("error")
        setGeoError(err.message)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // ── Device orientation (compass) ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) setCompassHeading(e.alpha)
    }
    // iOS 13+ needs permission
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === "function") {
      DOE.requestPermission().then((s: string) => {
        if (s === "granted") window.addEventListener("deviceorientation", handler)
      }).catch(() => {})
    } else {
      window.addEventListener("deviceorientation", handler)
    }
    return () => window.removeEventListener("deviceorientation", handler)
  }, [])

  // ── BLE scan ─────────────────────────────────────────────────────────────
  const startBLE = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any
    if (!nav.bluetooth) {
      setBleError("Web Bluetooth not available — use Chrome on desktop or Android")
      return
    }
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      setBleError("HTTPS is required for Bluetooth scanning")
      return
    }
    try {
      const scan = await nav.bluetooth.requestLEScan({ acceptAllAdvertisements: true })
      bleRef.current = scan
      setScanning(true)
      setBleError("")

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nav.bluetooth.addEventListener("advertisementreceived", (event: any) => {
        if (event.device.id !== deviceId) return
        const r: number = event.rssi ?? -80
        setRssi(r)
        setLastSeen(Date.now())
        if (posRef.current) {
          setReadings(prev => [...prev.slice(-99), { pos: posRef.current!, rssi: r, ts: Date.now() }])
        }
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("denied")) {
        setBleError("Permission denied. Tap Retry to try again.")
      } else {
        setBleError(`BLE error: ${msg}`)
      }
    }
  }, [deviceId])

  useEffect(() => {
    startBLE()
    return () => { if (bleRef.current) try { bleRef.current.stop() } catch {} }
  }, [startBLE])

  // ── Direction logic ──────────────────────────────────────────────────────
  // Best-signal reading in history (with enough GPS displacement to trust it)
  const bestReading = readings.length >= 3
    ? readings.reduce((a, b) => a.rssi > b.rssi ? a : b)
    : null

  // Only show arrow when current pos is meaningfully different from best-signal pos
  const distToBest = bestReading && pos
    ? haversine(pos.lat, pos.lon, bestReading.pos.lat, bestReading.pos.lon)
    : 0

  const rawBearing = bestReading && pos && distToBest > 3
    ? getBearing(pos.lat, pos.lon, bestReading.pos.lat, bestReading.pos.lon)
    : null

  // If compass heading available, make arrow relative to phone direction (north-up → heading-up)
  const arrowAngle = rawBearing !== null
    ? compassHeading !== null
      ? (rawBearing - compassHeading + 360) % 360
      : rawBearing
    : null

  // RSSI trend: last 3 vs 3 before that
  const trend = readings.length >= 6
    ? (readings.slice(-3).reduce((s, r) => s + r.rssi, 0) / 3) -
      (readings.slice(-6, -3).reduce((s, r) => s + r.rssi, 0) / 3)
    : null

  const strength = rssi !== null ? rssiToStrength(rssi) : 0
  const distance = rssi !== null ? rssiToDistance(rssi) : null
  const signalColor = strength > 0.65 ? "#22c55e" : strength > 0.35 ? "#eab308" : "#ef4444"
  const isStale = lastSeen !== null && Date.now() - lastSeen > 10_000

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/radar")}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-[#1a1a1a] text-gray-500 hover:text-gray-300 hover:border-[#2a2a2a] transition-all text-sm"
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-600 uppercase tracking-widest">Tracking</p>
          <h1 className="text-base font-semibold text-gray-100 truncate">{deviceName}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${scanning && !isStale ? "bg-green-400" : scanning ? "bg-yellow-500" : "bg-gray-700"}`}/>
          <span className="text-xs text-gray-600">{scanning ? (isStale ? "No signal" : "Live") : "Off"}</span>
        </div>
      </div>

      {/* ── Signal ring ── */}
      <div className="card p-6 mb-4 flex flex-col items-center">
        <div className="relative flex items-center justify-center mb-5" style={{ width: 220, height: 220 }}>
          {/* Concentric pulse rings */}
          {[1, 0.78, 0.58].map((scale, i) => {
            const pulseFactor = strength > 0 ? (Math.sin(((pulse + i * 60) * Math.PI) / 180) + 1) / 2 : 0
            return (
              <div
                key={i}
                className="absolute rounded-full border transition-all duration-300"
                style={{
                  width: 220 * scale,
                  height: 220 * scale,
                  borderColor: signalColor,
                  opacity: (0.08 + pulseFactor * 0.18) * strength,
                  transform: `scale(${1 + pulseFactor * 0.04 * strength})`,
                }}
              />
            )
          })}

          {/* Core circle */}
          <div
            className="w-28 h-28 rounded-full flex flex-col items-center justify-center border-2 transition-all duration-500"
            style={{
              borderColor: signalColor,
              boxShadow: `0 0 ${20 * strength}px ${signalColor}30`,
            }}
          >
            {rssi !== null ? (
              <>
                <span className="text-3xl font-bold tabular-nums transition-colors duration-300" style={{ color: signalColor }}>
                  {rssi}
                </span>
                <span className="text-xs text-gray-600 mt-0.5">dBm</span>
              </>
            ) : (
              <span className="text-xs text-gray-700 text-center px-2">
                {scanning ? "Waiting for\nsignal…" : "Starting…"}
              </span>
            )}
          </div>
        </div>

        {/* Signal strength bar */}
        <div className="w-full max-w-xs mb-4">
          <div className="h-1.5 bg-[#111] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${strength * 100}%`, background: `linear-gradient(to right, #ef4444, #eab308, ${signalColor})` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-700 mt-1">
            <span>Weak</span>
            <span>Strong</span>
          </div>
        </div>

        {/* Status text */}
        <div className="text-center space-y-1">
          {trend !== null && Math.abs(trend) > 0.5 && (
            <p className={`text-sm font-medium ${trend > 1.5 ? "text-green-400" : trend > 0 ? "text-green-600" : trend < -1.5 ? "text-red-400" : "text-red-600"}`}>
              {trend > 2 ? "▲ Getting much closer" : trend > 0.5 ? "↑ Getting closer" : trend < -2 ? "▼ Moving away fast" : "↓ Moving away"}
            </p>
          )}
          {distance !== null && (
            <p className="text-xs text-gray-500">
              {distance < 1 ? "Very close — under 1 metre" : `~${distance}m estimated distance`}
            </p>
          )}
          {rssi === null && scanning && (
            <p className="text-xs text-gray-700">Move closer to detect the signal</p>
          )}
          {bleError && (
            <div className="text-center mt-2">
              <p className="text-xs text-red-400 mb-2">{bleError}</p>
              <button onClick={startBLE} className="btn btn-ghost text-xs px-3 py-1.5">Retry BLE</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Direction arrow ── */}
      <div className="card p-5 mb-4">
        <p className="text-xs text-gray-600 uppercase tracking-wider mb-4 text-center">Direction</p>
        {arrowAngle !== null ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-28 h-28">
              {/* Compass ring */}
              <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full">
                <circle cx="56" cy="56" r="52" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
                {["N","NE","E","SE","S","SW","W","NW"].map((d, i) => {
                  const a = (i * 45 - 90) * Math.PI / 180
                  const r1 = 42, r2 = i % 2 === 0 ? 36 : 39
                  return (
                    <g key={d}>
                      <line x1={56 + r1 * Math.cos(a)} y1={56 + r1 * Math.sin(a)}
                        x2={56 + r2 * Math.cos(a)} y2={56 + r2 * Math.sin(a)}
                        stroke="#2a2a2a" strokeWidth={i % 2 === 0 ? 1.5 : 0.8}/>
                      {i % 2 === 0 && (
                        <text x={56 + 28 * Math.cos(a)} y={56 + 28 * Math.sin(a)}
                          textAnchor="middle" dominantBaseline="central"
                          fontSize="9" fill={d === "N" ? "#9ca3af" : "#374151"} fontFamily="monospace">{d}</text>
                      )}
                    </g>
                  )
                })}
                {/* Arrow */}
                <g transform={`rotate(${arrowAngle} 56 56)`}>
                  <polygon points="56,14 60,50 52,50" fill="#22c55e" opacity="0.9"/>
                  <polygon points="56,98 60,62 52,62" fill="#1a3a2a" opacity="0.6"/>
                  <circle cx="56" cy="56" r="3" fill="#22c55e"/>
                </g>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">
                Head toward <span className="text-green-400 font-medium">{Math.round(rawBearing ?? 0)}°</span>
                {compassHeading !== null && " (relative to you)"}
              </p>
              <p className="text-[10px] text-gray-700 mt-1">Based on strongest signal location</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="relative w-20 h-20 mx-auto mb-3">
              <svg viewBox="0 0 80 80" className="w-full h-full opacity-20">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#4b5563" strokeWidth="1"/>
                <polygon points="40,8 44,36 36,36" fill="#4b5563"/>
                <circle cx="40" cy="40" r="3" fill="#4b5563"/>
              </svg>
            </div>
            <p className="text-xs text-gray-600">
              {readings.length === 0
                ? "Waiting for first signal…"
                : readings.length < 3
                ? `Collecting data… (${readings.length}/3 readings)`
                : "Walk around — direction will appear when you move"}
            </p>
          </div>
        )}
      </div>

      {/* ── Signal history bars ── */}
      {readings.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-600 uppercase tracking-wider">Signal History</p>
            <span className="text-[10px] text-gray-700">{readings.length} readings</span>
          </div>
          <div className="flex items-end gap-px h-10">
            {readings.slice(-50).map((r, i, arr) => {
              const s = rssiToStrength(r.rssi)
              const col = s > 0.65 ? "#22c55e" : s > 0.35 ? "#eab308" : "#ef4444"
              const opacity = 0.2 + (i / arr.length) * 0.8
              return (
                <div key={i} className="flex-1 rounded-sm"
                  style={{ height: `${Math.max(8, s * 100)}%`, background: col, opacity }}/>
              )
            })}
          </div>
          {bestReading && (
            <p className="text-[10px] text-gray-700 mt-2">
              Best: {bestReading.rssi} dBm · {rssiToDistance(bestReading.rssi)}m
              {" at "}{new Date(bestReading.ts).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {/* ── GPS + status ── */}
      <div className="card p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">GPS</span>
          <span className={`text-xs font-mono ${geoStatus === "ok" ? "text-green-500" : geoStatus === "error" ? "text-red-400" : "text-gray-600"}`}>
            {geoStatus === "ok" && pos ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}` : geoStatus === "error" ? geoError : "Acquiring…"}
          </span>
        </div>
        {pos && geoStatus === "ok" && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">GPS Accuracy</span>
            <span className="text-xs text-gray-500">±{Math.round(pos.accuracy)}m</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Compass</span>
          <span className="text-xs text-gray-600">{compassHeading !== null ? `${Math.round(compassHeading)}°` : "Not available"}</span>
        </div>
        {lastSeen && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Last signal</span>
            <span className={`text-xs ${isStale ? "text-yellow-600" : "text-gray-500"}`}>
              {Math.round((Date.now() - lastSeen) / 1000)}s ago
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

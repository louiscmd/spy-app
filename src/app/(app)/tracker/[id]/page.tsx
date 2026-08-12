"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { getEntry, registerDevice, subscribeToStore } from "@/lib/bt-store"

// ─── Geo utils ───────────────────────────────────────────────────────────────

type GeoPos = { lat: number; lon: number; accuracy: number }
type Reading = { pos: GeoPos; rssi: number; ts: number }

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function rssiToDistance(rssi: number): number {
  return Math.round(Math.pow(10, (-rssi - 59) / 20) * 10) / 10
}

function rssiToStrength(rssi: number): number {
  return Math.max(0, Math.min(1, (rssi + 100) / 60))
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const deviceId = decodeURIComponent(params.id as string)
  const deviceName =
    searchParams.get("name") || `Device ${deviceId.slice(-6).toUpperCase()}`

  // Device from bt-store
  const [entry, setEntry] = useState(() => getEntry(deviceId))
  const rssi = entry?.rssi ?? null

  // GPS
  const [pos, setPos] = useState<GeoPos | null>(null)
  const [geoStatus, setGeoStatus] = useState<"requesting" | "ok" | "denied" | "error">("requesting")
  const [geoMsg, setGeoMsg] = useState("")

  // Direction
  const [readings, setReadings] = useState<Reading[]>([])
  const [compassHeading, setCompassHeading] = useState<number | null>(null)

  // BLE
  const [bleStatus, setBleStatus] = useState<"watching" | "unavailable" | "connecting">("connecting")
  const [bleMsg, setBleMsg] = useState("")

  // Animation
  const [pulse, setPulse] = useState(0)
  const [now, setNow] = useState(Date.now())

  const animRef = useRef<number>(0)
  const posRef = useRef<GeoPos | null>(null)
  const watchingRef = useRef(false)

  useEffect(() => { posRef.current = pos }, [pos])

  // ── Sync rssi from store ─────────────────────────────────────────────────
  useEffect(() => {
    setEntry(getEntry(deviceId))
    const unsub = subscribeToStore(() => {
      const e = getEntry(deviceId)
      setEntry(e)
      if (e?.rssi !== null && e?.rssi !== undefined && posRef.current) {
        setReadings(prev => [
          ...prev.slice(-99),
          { pos: posRef.current!, rssi: e.rssi!, ts: Date.now() },
        ])
      }
    })
    return unsub
  }, [deviceId])

  // ── Pulse animation ──────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      setPulse(p => (p + 2) % 360)
      setNow(Date.now())
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  // ── Geolocation ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("error")
      setGeoMsg("Geolocation not supported")
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
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus("denied")
          setGeoMsg("Location access denied — allow it in browser settings, then reload")
        } else {
          setGeoStatus("error")
          setGeoMsg(err.message)
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // ── Device orientation (compass) ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) setCompassHeading(e.alpha)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === "function") {
      DOE.requestPermission()
        .then((s: string) => { if (s === "granted") window.addEventListener("deviceorientation", handler) })
        .catch(() => {})
    } else {
      window.addEventListener("deviceorientation", handler)
    }
    return () => window.removeEventListener("deviceorientation", handler)
  }, [])

  // ── Start watchAdvertisements on this specific device ────────────────────
  const startWatching = useCallback(async () => {
    const e = getEntry(deviceId)
    if (!e) return

    if (watchingRef.current || e.watching) {
      setBleStatus("watching")
      return
    }

    setBleStatus("connecting")
    try {
      await e.device.watchAdvertisements()
      watchingRef.current = true
      registerDevice(e.device, e.rssi, true)
      setBleStatus("watching")

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e.device.addEventListener("advertisementreceived", (ev: any) => {
        registerDevice(e.device, ev.rssi ?? null, true)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setBleStatus("unavailable")
      setBleMsg(msg.includes("not found") || msg.includes("flag")
        ? "Enable chrome://flags → #enable-web-bluetooth-new-permissions-backend for live RSSI"
        : `RSSI unavailable: ${msg}`)
    }
  }, [deviceId])

  useEffect(() => { startWatching() }, [startWatching])

  // ── Direction maths ──────────────────────────────────────────────────────
  const bestReading =
    readings.length >= 3
      ? readings.reduce((a, b) => (a.rssi > b.rssi ? a : b))
      : null

  const distToBest =
    bestReading && pos
      ? haversine(pos.lat, pos.lon, bestReading.pos.lat, bestReading.pos.lon)
      : 0

  const rawBearing =
    bestReading && pos && distToBest > 3
      ? getBearing(pos.lat, pos.lon, bestReading.pos.lat, bestReading.pos.lon)
      : null

  // Make arrow heading-relative when compass is available
  const arrowAngle =
    rawBearing !== null
      ? compassHeading !== null
        ? (rawBearing - compassHeading + 360) % 360
        : rawBearing
      : null

  // Trend: last 3 vs 3 before that
  const trend =
    readings.length >= 6
      ? readings.slice(-3).reduce((s, r) => s + r.rssi, 0) / 3 -
        readings.slice(-6, -3).reduce((s, r) => s + r.rssi, 0) / 3
      : null

  const strength = rssi !== null ? rssiToStrength(rssi) : 0
  const distance = rssi !== null ? rssiToDistance(rssi) : null
  const signalColor =
    strength > 0.65 ? "#22c55e" : strength > 0.35 ? "#eab308" : "#ef4444"

  // ── No entry in store ────────────────────────────────────────────────────
  if (!entry) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/radar")}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-[#1a1a1a] text-gray-500 hover:text-gray-300 transition-all text-sm"
          >
            ←
          </button>
          <h1 className="text-base font-semibold text-gray-100">Tracker</h1>
        </div>
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-500 mb-4">Device not found in this session.</p>
          <p className="text-xs text-gray-700 mb-4">
            Go back to the radar, select a device, then tap Track.
          </p>
          <button onClick={() => router.push("/radar")} className="btn btn-silver text-xs px-4 py-2">
            ← Back to Radar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/radar")}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-[#1a1a1a] text-gray-500 hover:text-gray-300 transition-all text-sm"
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-600 uppercase tracking-widest">Tracking</p>
          <h1 className="text-base font-semibold text-gray-100 truncate">{deviceName}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              bleStatus === "watching"
                ? "bg-green-400 animate-pulse"
                : bleStatus === "connecting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-gray-700"
            }`}
          />
          <span className="text-xs text-gray-600">
            {bleStatus === "watching"
              ? "Live RSSI"
              : bleStatus === "connecting"
              ? "Connecting…"
              : "No RSSI"}
          </span>
        </div>
      </div>

      {/* ── Signal ring ── */}
      <div className="card p-6 mb-4 flex flex-col items-center">
        <div className="relative flex items-center justify-center mb-5" style={{ width: 220, height: 220 }}>
          {[1, 0.78, 0.58].map((scale, i) => {
            const pf = strength > 0 ? (Math.sin(((pulse + i * 60) * Math.PI) / 180) + 1) / 2 : 0
            return (
              <div
                key={i}
                className="absolute rounded-full border transition-all duration-300"
                style={{
                  width: 220 * scale, height: 220 * scale,
                  borderColor: signalColor,
                  opacity: (0.06 + pf * 0.2) * Math.max(strength, 0.1),
                  transform: `scale(${1 + pf * 0.04 * strength})`,
                }}
              />
            )
          })}
          <div
            className="w-28 h-28 rounded-full flex flex-col items-center justify-center border-2 transition-all duration-500"
            style={{
              borderColor: signalColor,
              boxShadow: `0 0 ${24 * strength}px ${signalColor}28`,
            }}
          >
            {rssi !== null ? (
              <>
                <span className="text-3xl font-bold tabular-nums" style={{ color: signalColor }}>
                  {rssi}
                </span>
                <span className="text-xs text-gray-600 mt-0.5">dBm</span>
              </>
            ) : (
              <span className="text-xs text-gray-700 text-center px-2 leading-snug">
                {bleStatus === "connecting" ? "Starting…" : "No signal"}
              </span>
            )}
          </div>
        </div>

        {/* Strength bar */}
        <div className="w-full max-w-xs mb-4">
          <div className="h-1.5 bg-[#111] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(0, strength) * 100}%`,
                background: `linear-gradient(to right, #ef4444, #eab308, ${signalColor})`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-700 mt-1">
            <span>Weak (far)</span>
            <span>Strong (close)</span>
          </div>
        </div>

        {/* Trend + distance */}
        <div className="text-center space-y-1">
          {trend !== null && Math.abs(trend) > 0.5 && (
            <p
              className={`text-sm font-medium ${
                trend > 1.5
                  ? "text-green-400"
                  : trend > 0
                  ? "text-green-600"
                  : trend < -1.5
                  ? "text-red-400"
                  : "text-red-600"
              }`}
            >
              {trend > 2
                ? "▲ Getting much closer"
                : trend > 0.5
                ? "↑ Getting closer"
                : trend < -2
                ? "▼ Moving away fast"
                : "↓ Moving away"}
            </p>
          )}
          {distance !== null && (
            <p className="text-xs text-gray-500">
              {distance < 1 ? "Under 1 metre away" : `~${distance}m estimated`}
            </p>
          )}
          {bleStatus === "unavailable" && (
            <p className="text-[11px] text-yellow-700 mt-1 max-w-xs">{bleMsg}</p>
          )}
        </div>
      </div>

      {/* ── Direction compass ── */}
      <div className="card p-5 mb-4">
        <p className="text-xs text-gray-600 uppercase tracking-wider mb-4 text-center">Direction</p>

        {arrowAngle !== null ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 128 128" className="w-full h-full">
                <circle cx="64" cy="64" r="60" fill="none" stroke="#1a1a1a" strokeWidth="1" />
                {["N", "E", "S", "W"].map((d, i) => {
                  const a = (i * 90 - 90) * (Math.PI / 180)
                  return (
                    <text
                      key={d}
                      x={64 + 48 * Math.cos(a)}
                      y={64 + 48 * Math.sin(a)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="10"
                      fill={d === "N" ? "#9ca3af" : "#374151"}
                      fontFamily="monospace"
                    >
                      {d}
                    </text>
                  )
                })}
                {/* Tick marks */}
                {Array.from({ length: 16 }).map((_, i) => {
                  const a = (i * 22.5 - 90) * (Math.PI / 180)
                  const r1 = 56, r2 = i % 4 === 0 ? 48 : 52
                  return (
                    <line
                      key={i}
                      x1={64 + r1 * Math.cos(a)} y1={64 + r1 * Math.sin(a)}
                      x2={64 + r2 * Math.cos(a)} y2={64 + r2 * Math.sin(a)}
                      stroke={i % 4 === 0 ? "#2a2a2a" : "#1a1a1a"}
                      strokeWidth={i % 4 === 0 ? 1.5 : 0.8}
                    />
                  )
                })}
                {/* Arrow */}
                <g transform={`rotate(${arrowAngle} 64 64)`}>
                  <polygon points="64,12 68,56 60,56" fill="#22c55e" opacity="0.9" />
                  <polygon points="64,116 68,72 60,72" fill="#1a3a2a" opacity="0.5" />
                  <circle cx="64" cy="64" r="4" fill="#22c55e" />
                </g>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">
                Bearing{" "}
                <span className="text-green-400 font-medium">{Math.round(rawBearing ?? 0)}°</span>
                {compassHeading !== null && " — relative to phone orientation"}
              </p>
              <p className="text-[10px] text-gray-700 mt-0.5">
                Points toward location with strongest signal
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-3">
            <svg viewBox="0 0 80 80" className="w-16 h-16 mx-auto mb-3 opacity-15">
              <circle cx="40" cy="40" r="36" fill="none" stroke="#4b5563" strokeWidth="1" />
              <polygon points="40,8 44,38 36,38" fill="#4b5563" />
              <circle cx="40" cy="40" r="3" fill="#4b5563" />
            </svg>
            <p className="text-xs text-gray-600">
              {geoStatus !== "ok"
                ? "Waiting for GPS…"
                : readings.length < 3
                ? `Walk around to calibrate (${readings.length}/3 readings)`
                : "Keep walking — arrow appears when you move far enough"}
            </p>
          </div>
        )}
      </div>

      {/* ── Signal history ── */}
      {readings.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-600 uppercase tracking-wider">Signal History</p>
            <span className="text-[10px] text-gray-700">{readings.length} readings</span>
          </div>
          <div className="flex items-end gap-px h-10">
            {readings.slice(-60).map((rd, i, arr) => {
              const s = rssiToStrength(rd.rssi)
              const col = s > 0.65 ? "#22c55e" : s > 0.35 ? "#eab308" : "#ef4444"
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${Math.max(8, s * 100)}%`,
                    background: col,
                    opacity: 0.2 + (i / arr.length) * 0.8,
                  }}
                />
              )
            })}
          </div>
          {bestReading && (
            <p className="text-[10px] text-gray-700 mt-1.5">
              Best: {bestReading.rssi} dBm ≈ {rssiToDistance(bestReading.rssi)}m at{" "}
              {new Date(bestReading.ts).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {/* ── Status panel ── */}
      <div className="card p-4 space-y-2.5">
        {/* GPS */}
        <div className="flex items-start justify-between gap-4">
          <span className="text-xs text-gray-600 shrink-0">GPS</span>
          <span
            className={`text-xs font-mono text-right ${
              geoStatus === "ok"
                ? "text-green-500"
                : geoStatus === "denied"
                ? "text-red-400"
                : "text-gray-600"
            }`}
          >
            {geoStatus === "ok" && pos
              ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`
              : geoStatus === "requesting"
              ? "Requesting permission…"
              : geoMsg}
          </span>
        </div>
        {pos && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">GPS Accuracy</span>
            <span className="text-xs text-gray-500">±{Math.round(pos.accuracy)}m</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Compass</span>
          <span className="text-xs text-gray-600">
            {compassHeading !== null ? `${Math.round(compassHeading)}°` : "Not available"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">RSSI readings</span>
          <span className="text-xs text-gray-600">{readings.length}</span>
        </div>
      </div>
    </div>
  )
}

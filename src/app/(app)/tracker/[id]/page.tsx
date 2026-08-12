"use client"
import { useEffect, useRef, useState, useMemo, useCallback } from "react"
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
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function rssiToDistance(rssi: number) {
  return Math.round(Math.pow(10, (-rssi - 59) / 20) * 10) / 10
}

function rssiToStrength(rssi: number) {
  return Math.max(0, Math.min(1, (rssi + 100) / 60))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const params    = useParams()
  const search    = useSearchParams()
  const router    = useRouter()
  const deviceId  = decodeURIComponent(params.id as string)
  const deviceName = search.get("name") || `Device ${deviceId.slice(-6).toUpperCase()}`

  // ── State — only what genuinely needs a re-render ──────────────────────
  const [rssi,          setRssi]          = useState<number | null>(null)
  const [pos,           setPos]           = useState<GeoPos | null>(null)
  const [readings,      setReadings]      = useState<Reading[]>([])
  const [compassAngle,  setCompassAngle]  = useState<number | null>(null)
  const [geoStatus,     setGeoStatus]     = useState<"waiting"|"ok"|"denied"|"error">("waiting")
  const [geoMsg,        setGeoMsg]        = useState("")
  const [bleStatus,     setBleStatus]     = useState<"connecting"|"watching"|"unavailable">("connecting")
  const [bleMsg,        setBleMsg]        = useState("")

  // ── Refs — values that update fast but don't need renders ──────────────
  const posRef              = useRef<GeoPos | null>(null)
  const lastGeoRender       = useRef<GeoPos | null>(null)
  const lastRssiRenderMs    = useRef(0)
  const lastCompassRenderMs = useRef(0)
  const watchingRef         = useRef(false)

  // ── Sync from store (device RSSI updates from radar page) ──────────────
  useEffect(() => {
    const unsub = subscribeToStore(() => {
      const e = getEntry(deviceId)
      if (!e?.rssi) return
      const now = Date.now()
      // Throttle to once per second max — avoids flooding renders
      if (now - lastRssiRenderMs.current < 900) return
      lastRssiRenderMs.current = now
      setRssi(e.rssi)
      if (posRef.current) {
        setReadings(prev => [
          ...prev.slice(-99),
          { pos: posRef.current!, rssi: e.rssi!, ts: now },
        ])
      }
    })
    // Seed initial value
    const e = getEntry(deviceId)
    if (e?.rssi != null) setRssi(e.rssi)
    return unsub
  }, [deviceId])

  // ── GPS — debounced: only re-render when moved >3 m or every 4 s ──────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("error"); setGeoMsg("Geolocation not supported"); return
    }
    let lastRenderTs = 0
    const watchId = navigator.geolocation.watchPosition(
      p => {
        const gp: GeoPos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }
        posRef.current = gp          // always current, no render
        const now = Date.now()
        const moved = lastGeoRender.current
          ? haversine(lastGeoRender.current.lat, lastGeoRender.current.lon, gp.lat, gp.lon)
          : 999
        // Re-render only if moved >3 m, or no update for 4 s
        if (moved > 3 || now - lastRenderTs > 4000) {
          lastRenderTs = now
          lastGeoRender.current = gp
          setPos(gp)
          setGeoStatus("ok")
        }
      },
      err => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error")
        setGeoMsg(err.code === err.PERMISSION_DENIED
          ? "Location denied — allow in Settings, then reload"
          : err.message)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // ── Compass — throttled to 5 Hz (plenty for a smooth arrow) ──────────
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha === null) return
      const now = Date.now()
      if (now - lastCompassRenderMs.current < 200) return
      lastCompassRenderMs.current = now
      setCompassAngle(e.alpha)
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

  // ── BLE — start watchAdvertisements on this device ────────────────────
  const startWatching = useCallback(async () => {
    const e = getEntry(deviceId)
    if (!e || watchingRef.current || e.watching) {
      if (e?.watching) setBleStatus("watching")
      return
    }
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
      setBleMsg(msg.includes("flag") || msg.includes("not found")
        ? "Enable chrome://flags → #enable-web-bluetooth-new-permissions-backend"
        : msg)
    }
  }, [deviceId])

  useEffect(() => { startWatching() }, [startWatching])

  // ── Derived values — memoised, recompute only when inputs change ───────
  const { bestReading, trend, rawBearing, distance, strength } = useMemo(() => {
    const strength    = rssi != null ? rssiToStrength(rssi) : 0
    const distance    = rssi != null ? rssiToDistance(rssi) : null
    const bestReading = readings.length >= 3
      ? readings.reduce((a, b) => a.rssi > b.rssi ? a : b)
      : null
    const trend = readings.length >= 6
      ? readings.slice(-3).reduce((s, r) => s + r.rssi, 0) / 3 -
        readings.slice(-6, -3).reduce((s, r) => s + r.rssi, 0) / 3
      : null
    const distToBest = bestReading && pos
      ? haversine(pos.lat, pos.lon, bestReading.pos.lat, bestReading.pos.lon)
      : 0
    const rawBearing = bestReading && pos && distToBest > 3
      ? getBearing(pos.lat, pos.lon, bestReading.pos.lat, bestReading.pos.lon)
      : null
    return { bestReading, trend, rawBearing, distance, strength }
  }, [rssi, readings, pos])

  // Arrow angle relative to compass heading
  const arrowAngle = rawBearing != null
    ? compassAngle != null ? (rawBearing - compassAngle + 360) % 360 : rawBearing
    : null

  const signalColor = strength > 0.65 ? "#22c55e" : strength > 0.35 ? "#eab308" : "#ef4444"
  const isFast      = strength > 0.65   // rings pulse faster when close

  const entry = getEntry(deviceId)
  if (!entry) return (
    <div className="p-6 max-w-lg mx-auto">
      <button onClick={() => router.push("/radar")} className="text-gray-500 text-sm mb-6 hover:text-gray-300">← Radar</button>
      <div className="card p-6 text-center space-y-3">
        <p className="text-sm text-gray-500">Device not in this session.</p>
        <p className="text-xs text-gray-700">Go back to the radar and select the device first.</p>
        <button onClick={() => router.push("/radar")} className="btn btn-silver text-xs px-4 py-2">← Back to Radar</button>
      </div>
    </div>
  )

  return (
    <div className="p-4 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.push("/radar")}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-[#1a1a1a] text-gray-500 hover:text-gray-300 transition-all text-sm shrink-0"
        >←</button>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-600 uppercase tracking-widest">Tracking</p>
          <h1 className="text-base font-semibold text-gray-100 truncate">{deviceName}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${
            bleStatus === "watching" ? "bg-green-400 animate-pulse"
            : bleStatus === "connecting" ? "bg-yellow-500 animate-pulse"
            : "bg-gray-700"
          }`}/>
          <span className="text-xs text-gray-600">
            {bleStatus === "watching" ? "Live" : bleStatus === "connecting" ? "Starting…" : "No RSSI"}
          </span>
        </div>
      </div>

      {/* ── Signal ring — pure CSS animation, zero JS re-renders ── */}
      <div className="card p-6 mb-4 flex flex-col items-center">
        <div className={`relative flex items-center justify-center mb-5 ${isFast ? "signal-ring-fast" : ""}`}
          style={{ width: 200, height: 200 }}>

          {/* CSS-animated rings — no RAF, no state, GPU-composited */}
          {[200, 160, 124].map((size, i) => (
            <div key={i}
              className={`absolute rounded-full border signal-ring-${i + 1}`}
              style={{
                width: size, height: size,
                borderColor: signalColor,
                opacity: strength * (0.35 - i * 0.08),
                // opacity:0 when no signal so rings disappear cleanly
                display: strength < 0.05 ? "none" : undefined,
              }}
            />
          ))}

          {/* Core */}
          <div
            className="w-28 h-28 rounded-full flex flex-col items-center justify-center border-2"
            style={{
              borderColor: signalColor,
              boxShadow: strength > 0.1 ? `0 0 ${20 * strength}px ${signalColor}28` : "none",
              transition: "border-color 0.6s, box-shadow 0.6s",
            }}
          >
            {rssi != null ? (
              <>
                <span className="text-3xl font-bold tabular-nums"
                  style={{ color: signalColor, transition: "color 0.6s" }}>
                  {rssi}
                </span>
                <span className="text-xs text-gray-600 mt-0.5">dBm</span>
              </>
            ) : (
              <span className="text-xs text-gray-700 text-center px-3 leading-snug">
                {bleStatus === "connecting" ? "Starting…" : "No signal"}
              </span>
            )}
          </div>
        </div>

        {/* Strength bar */}
        <div className="w-full max-w-xs mb-3">
          <div className="h-1.5 bg-[#111] rounded-full overflow-hidden">
            <div className="h-full rounded-full"
              style={{
                width: `${strength * 100}%`,
                background: `linear-gradient(to right, #ef4444, #eab308, ${signalColor})`,
                transition: "width 0.8s ease-out",
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-700 mt-1">
            <span>Weak</span><span>Strong</span>
          </div>
        </div>

        {/* Trend label */}
        {trend != null && Math.abs(trend) > 0.5 && (
          <p className={`text-sm font-medium ${
            trend > 1.5 ? "text-green-400" : trend > 0 ? "text-green-600"
            : trend < -1.5 ? "text-red-400" : "text-red-600"
          }`}>
            {trend > 2 ? "▲ Getting much closer"
              : trend > 0.5 ? "↑ Getting closer"
              : trend < -2 ? "▼ Moving away fast"
              : "↓ Moving away"}
          </p>
        )}
        {distance != null && (
          <p className="text-xs text-gray-500 mt-1">
            {distance < 1 ? "Under 1 metre" : `~${distance} m estimated`}
          </p>
        )}
        {bleStatus === "unavailable" && bleMsg && (
          <p className="text-[11px] text-yellow-700 mt-2 text-center max-w-xs">{bleMsg}</p>
        )}
      </div>

      {/* ── Direction compass ── */}
      <div className="card p-5 mb-4">
        <p className="text-xs text-gray-600 uppercase tracking-wider mb-4 text-center">Direction</p>

        {arrowAngle != null ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 144 144" className="w-full h-full">
                <circle cx="72" cy="72" r="68" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
                {/* 16 tick marks */}
                {Array.from({ length: 16 }).map((_, i) => {
                  const a = (i * 22.5 - 90) * (Math.PI / 180)
                  const major = i % 4 === 0
                  const r1 = 62, r2 = major ? 54 : 58
                  return <line key={i}
                    x1={72 + r1 * Math.cos(a)} y1={72 + r1 * Math.sin(a)}
                    x2={72 + r2 * Math.cos(a)} y2={72 + r2 * Math.sin(a)}
                    stroke={major ? "#2a2a2a" : "#1a1a1a"} strokeWidth={major ? 1.5 : 0.8}/>
                })}
                {/* Cardinal labels */}
                {["N","E","S","W"].map((d, i) => {
                  const a = (i * 90 - 90) * (Math.PI / 180)
                  return <text key={d}
                    x={72 + 44 * Math.cos(a)} y={72 + 44 * Math.sin(a)}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="11" fill={d === "N" ? "#9ca3af" : "#374151"} fontFamily="monospace">{d}</text>
                })}
                {/* Arrow — CSS transition handles smooth rotation */}
                <g style={{ transformOrigin: "72px 72px", transform: `rotate(${arrowAngle}deg)`, transition: "transform 0.5s ease-out" }}>
                  <polygon points="72,16 76.5,62 67.5,62" fill="#22c55e" opacity="0.95"/>
                  <polygon points="72,128 76.5,82 67.5,82" fill="#1a3a2a" opacity="0.5"/>
                  <circle cx="72" cy="72" r="4.5" fill="#22c55e"/>
                </g>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">
                Bearing <span className="text-green-400 font-medium">{Math.round(rawBearing ?? 0)}°</span>
                {compassAngle != null && <span className="text-gray-600"> · relative to you</span>}
              </p>
              <p className="text-[10px] text-gray-700 mt-0.5">Walk toward strongest signal location</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <svg viewBox="0 0 80 80" className="w-14 h-14 mx-auto mb-3 opacity-10">
              <circle cx="40" cy="40" r="36" fill="none" stroke="#4b5563" strokeWidth="1"/>
              <polygon points="40,8 44,38 36,38" fill="#4b5563"/>
              <circle cx="40" cy="40" r="3" fill="#4b5563"/>
            </svg>
            <p className="text-xs text-gray-600">
              {geoStatus !== "ok"
                ? "Waiting for GPS…"
                : readings.length < 3
                ? `Walk around to calibrate (${readings.length}/3 readings)`
                : "Keep moving — arrow appears once you've covered some distance"}
            </p>
          </div>
        )}
      </div>

      {/* ── Signal history bars ── */}
      {readings.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-600 uppercase tracking-wider">Signal History</p>
            <span className="text-[10px] text-gray-700">{readings.length} pts</span>
          </div>
          <div className="flex items-end gap-px h-10">
            {readings.slice(-60).map((rd, i, arr) => {
              const s = rssiToStrength(rd.rssi)
              const col = s > 0.65 ? "#22c55e" : s > 0.35 ? "#eab308" : "#ef4444"
              return <div key={i} className="flex-1 rounded-sm"
                style={{ height: `${Math.max(8, s * 100)}%`, background: col, opacity: 0.2 + (i / arr.length) * 0.8 }}/>
            })}
          </div>
          {bestReading && (
            <p className="text-[10px] text-gray-700 mt-1.5">
              Best: {bestReading.rssi} dBm ≈ {rssiToDistance(bestReading.rssi)}m
              {" · "}{new Date(bestReading.ts).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {/* ── Status ── */}
      <div className="card p-4 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <span className="text-xs text-gray-600 shrink-0">GPS</span>
          <span className={`text-xs font-mono text-right ${
            geoStatus === "ok" ? "text-green-500"
            : geoStatus === "denied" ? "text-red-400"
            : "text-gray-600"
          }`}>
            {geoStatus === "ok" && pos
              ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`
              : geoStatus === "waiting" ? "Requesting…"
              : geoMsg}
          </span>
        </div>
        {pos && <div className="flex justify-between">
          <span className="text-xs text-gray-600">Accuracy</span>
          <span className="text-xs text-gray-500">±{Math.round(pos.accuracy)}m</span>
        </div>}
        <div className="flex justify-between">
          <span className="text-xs text-gray-600">Compass</span>
          <span className="text-xs text-gray-600">
            {compassAngle != null ? `${Math.round(compassAngle)}°` : "Unavailable"}
          </span>
        </div>
      </div>
    </div>
  )
}

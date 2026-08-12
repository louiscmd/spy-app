"use client"
import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { getEntry, registerDevice, subscribeToStore } from "@/lib/bt-store"

// ─── Geo utils ────────────────────────────────────────────────────────────────

type GeoPos  = { lat: number; lon: number; accuracy: number }
type Reading = { pos: GeoPos; rssi: number; ts: number }

function haversine(a: GeoPos, b: GeoPos): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function bearing(from: GeoPos, to: GeoPos): number {
  const dLon = ((to.lon - from.lon) * Math.PI) / 180
  const φ1 = (from.lat * Math.PI) / 180, φ2 = (to.lat * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// Log-distance path-loss model, TxPower = −59 dBm, n = 2
function rssiToMetres(rssi: number): number {
  return Math.pow(10, (-rssi - 59) / 20)
}

function rssiToStrength(rssi: number): number {
  return Math.max(0, Math.min(1, (rssi + 100) / 60))
}

function fmtDist(m: number): string {
  if (m < 1)   return `${Math.round(m * 100)} cm`
  if (m < 10)  return `${m.toFixed(1)} m`
  if (m < 100) return `${Math.round(m)} m`
  return `>${Math.round(m / 10) * 10} m`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const params     = useParams()
  const search     = useSearchParams()
  const router     = useRouter()
  const deviceId   = decodeURIComponent(params.id as string)
  const deviceName = search.get("name") || `Device ${deviceId.slice(-6).toUpperCase()}`

  // ── React state — ONLY what drives visible re-renders ─────────────────
  const [displayDist,  setDisplayDist]  = useState<number | null>(null)   // metres, smoothed
  const [displayRssi,  setDisplayRssi]  = useState<number | null>(null)   // dBm, smoothed
  const [strength,     setStrength]     = useState(0)                     // 0–1
  const [trend,        setTrend]        = useState<number | null>(null)   // dBm/reading
  const [arrowVisible, setArrowVisible] = useState(false)                 // show compass arrow
  const [readings,     setReadings]     = useState<Reading[]>([])
  const [pos,          setPos]          = useState<GeoPos | null>(null)
  const [geoStatus,    setGeoStatus]    = useState<"waiting"|"ok"|"denied"|"error">("waiting")
  const [geoMsg,       setGeoMsg]       = useState("")
  const [bleStatus,    setBleStatus]    = useState<"connecting"|"watching"|"unavailable">("connecting")
  const [bleMsg,       setBleMsg]       = useState("")

  // ── Refs — fast-moving values that must NOT trigger re-renders ─────────
  const arrowElRef     = useRef<SVGGElement>(null)   // SVG arrow element — DOM-manipulated directly
  const rawBearingRef  = useRef<number | null>(null) // bearing from current pos to best-signal pos
  const emaRssiRef     = useRef<number | null>(null) // exponential moving average of RSSI
  const posRef         = useRef<GeoPos | null>(null) // always-current GPS pos, no render needed
  const lastGeoPos     = useRef<GeoPos | null>(null) // last pos that triggered a render
  const readingsRef    = useRef<Reading[]>([])        // mirror of readings without closure issues
  const watchingRef    = useRef(false)
  const lastRssiMs     = useRef(0)

  // Keep readingsRef in sync
  useEffect(() => { readingsRef.current = readings }, [readings])

  // ── Display update loop — 2 Hz, reads smoothed refs, sets state ────────
  // This is the only source of distance/rssi/strength/trend re-renders.
  useEffect(() => {
    const t = setInterval(() => {
      const ema = emaRssiRef.current
      if (ema === null) return
      setDisplayRssi(Math.round(ema))
      setDisplayDist(rssiToMetres(ema))
      setStrength(rssiToStrength(ema))

      // Trend: average of last 3 minus previous 3 readings
      const rs = readingsRef.current
      if (rs.length >= 6) {
        const t3 = rs.slice(-3).reduce((s, r) => s + r.rssi, 0) / 3
        const p3 = rs.slice(-6, -3).reduce((s, r) => s + r.rssi, 0) / 3
        setTrend(t3 - p3)
      }
    }, 500)
    return () => clearInterval(t)
  }, [])

  // ── Compass — bypass React entirely, write SVG transform directly ──────
  // This gives smooth 60 Hz rotation with zero React re-renders.
  useEffect(() => {
    function applyCompass(heading: number) {
      if (!arrowElRef.current) return
      if (rawBearingRef.current === null) return
      const angle = (rawBearingRef.current - heading + 360) % 360
      arrowElRef.current.style.transform = `rotate(${angle}deg)`
    }

    function handler(e: DeviceOrientationEvent) {
      // webkitCompassHeading is the magnetic north heading on iOS (most accurate)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heading = (e as any).webkitCompassHeading ?? e.alpha
      if (heading == null) return
      applyCompass(heading)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === "function") {
      DOE.requestPermission()
        .then((s: string) => { if (s === "granted") window.addEventListener("deviceorientation", handler, { passive: true }) })
        .catch(() => {})
    } else {
      window.addEventListener("deviceorientation", handler, { passive: true })
    }
    return () => window.removeEventListener("deviceorientation", handler)
  }, [])

  // ── Recompute bearing whenever readings or pos changes ─────────────────
  // Write to rawBearingRef — the compass handler picks it up on next frame.
  const recomputeBearing = useCallback((rs: Reading[], currentPos: GeoPos | null) => {
    if (!currentPos || rs.length < 3) {
      rawBearingRef.current = null
      setArrowVisible(false)
      return
    }
    const best = rs.reduce((a, b) => a.rssi > b.rssi ? a : b)
    const dist = haversine(currentPos, best.pos)
    if (dist < 3) {
      rawBearingRef.current = null
      setArrowVisible(false)
    } else {
      rawBearingRef.current = bearing(currentPos, best.pos)
      setArrowVisible(true)
    }
  }, [])

  // ── GPS — debounce render; always keep posRef fresh ────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("error"); setGeoMsg("Geolocation not supported"); return
    }
    let lastRenderMs = 0

    const id = navigator.geolocation.watchPosition(
      p => {
        const gp: GeoPos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }
        posRef.current = gp

        const now   = Date.now()
        const moved = lastGeoPos.current ? haversine(lastGeoPos.current, gp) : 999

        // Re-render only if moved >3 m or 4 s elapsed — then recompute bearing
        if (moved > 3 || now - lastRenderMs > 4000) {
          lastRenderMs     = now
          lastGeoPos.current = gp
          setPos(gp)
          setGeoStatus("ok")
          recomputeBearing(readingsRef.current, gp)
        }
      },
      err => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error")
        setGeoMsg(err.code === err.PERMISSION_DENIED
          ? "Location denied — allow in Settings then reload"
          : err.message)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [recomputeBearing])

  // ── BLE: sync store + record readings ─────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToStore(() => {
      const e = getEntry(deviceId)
      if (!e?.rssi) return

      // EMA: α=0.25 → smooth, but reacts within ~4 events
      emaRssiRef.current = emaRssiRef.current === null
        ? e.rssi
        : 0.25 * e.rssi + 0.75 * emaRssiRef.current

      // Record a reading at most once per second (avoids huge array from fast advertisers)
      const now = Date.now()
      if (now - lastRssiMs.current >= 1000 && posRef.current) {
        lastRssiMs.current = now
        setReadings(prev => {
          const next = [...prev.slice(-99), { pos: posRef.current!, rssi: e.rssi!, ts: now }]
          recomputeBearing(next, posRef.current)
          return next
        })
      }
    })
    // Seed
    const e = getEntry(deviceId)
    if (e?.rssi != null) {
      emaRssiRef.current = e.rssi
      setDisplayRssi(e.rssi)
      setDisplayDist(rssiToMetres(e.rssi))
      setStrength(rssiToStrength(e.rssi))
    }
    return unsub
  }, [deviceId, recomputeBearing])

  // ── Start watchAdvertisements ─────────────────────────────────────────
  useEffect(() => {
    const e = getEntry(deviceId)
    if (!e || watchingRef.current || e.watching) {
      if (e?.watching) setBleStatus("watching")
      return
    }
    async function start() {
      try {
        await e!.device.watchAdvertisements()
        watchingRef.current = true
        registerDevice(e!.device, e!.rssi, true)
        setBleStatus("watching")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e!.device.addEventListener("advertisementreceived", (ev: any) => {
          registerDevice(e!.device, ev.rssi ?? null, true)
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setBleStatus("unavailable")
        setBleMsg(msg.includes("flag") || msg.includes("not found")
          ? "Enable chrome://flags → #enable-web-bluetooth-new-permissions-backend for live RSSI"
          : msg)
      }
    }
    start()
  }, [deviceId])

  // ── Derived display values (memoised) ─────────────────────────────────
  const signalColor = displayRssi != null
    ? (strength > 0.65 ? "#22c55e" : strength > 0.35 ? "#eab308" : "#ef4444")
    : "#374151"

  const bestReading = useMemo(() =>
    readings.length >= 3 ? readings.reduce((a, b) => a.rssi > b.rssi ? a : b) : null,
    [readings]
  )

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
        <button onClick={() => router.push("/radar")}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-[#1a1a1a] text-gray-500 hover:text-gray-300 transition-all text-sm shrink-0">
          ←
        </button>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-600 uppercase tracking-widest">Tracking</p>
          <h1 className="text-base font-semibold text-gray-100 truncate">{deviceName}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${
            bleStatus === "watching"   ? "bg-green-400 animate-pulse"
            : bleStatus === "connecting" ? "bg-yellow-500 animate-pulse"
            : "bg-gray-700"}`}/>
          <span className="text-xs text-gray-600">
            {bleStatus === "watching" ? "Live" : bleStatus === "connecting" ? "Starting…" : "No RSSI"}
          </span>
        </div>
      </div>

      {/* ── Distance — large, prominent, like Find My ── */}
      <div className="card p-6 mb-4 text-center">
        <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Distance</p>
        <p className="text-5xl font-bold tabular-nums mb-1"
          style={{ color: signalColor, transition: "color 0.6s" }}>
          {displayDist != null ? fmtDist(displayDist) : "—"}
        </p>
        {trend != null && Math.abs(trend) > 0.4 && (
          <p className={`text-sm mt-2 font-medium ${
            trend > 1.5 ? "text-green-400" : trend > 0 ? "text-green-600"
            : trend < -1.5 ? "text-red-400" : "text-red-600"}`}>
            {trend > 2 ? "▲ Getting much closer"
              : trend > 0.4 ? "↑ Getting closer"
              : trend < -2 ? "▼ Moving away fast"
              : "↓ Moving away"}
          </p>
        )}
        {/* Strength bar */}
        <div className="mt-4 h-2 bg-[#111] rounded-full overflow-hidden mx-auto max-w-xs">
          <div className="h-full rounded-full"
            style={{
              width: `${strength * 100}%`,
              background: `linear-gradient(to right, #ef4444, #eab308, ${signalColor})`,
              transition: "width 0.5s ease-out",
            }}/>
        </div>
        <div className="flex justify-between text-[10px] text-gray-700 mt-1 max-w-xs mx-auto">
          <span>Far</span>
          <span className="text-gray-600 font-mono">{displayRssi != null ? `${displayRssi} dBm` : ""}</span>
          <span>Near</span>
        </div>
      </div>

      {/* ── Compass — pure CSS + direct DOM, zero React re-renders ── */}
      <div className="card p-5 mb-4">
        <p className="text-xs text-gray-600 uppercase tracking-wider mb-4 text-center">Direction</p>

        {arrowVisible ? (
          <div className="flex flex-col items-center gap-3">
            {/* SVG compass ring + arrow */}
            <svg viewBox="0 0 144 144" className="w-44 h-44">
              {/* Outer ring */}
              <circle cx="72" cy="72" r="68" fill="none" stroke="#1a1a1a" strokeWidth="1"/>
              {/* Tick marks */}
              {Array.from({ length: 32 }).map((_, i) => {
                const a   = (i * 11.25 - 90) * (Math.PI / 180)
                const major = i % 8 === 0, minor = i % 4 === 0
                const r1  = 64, r2 = major ? 54 : minor ? 58 : 61
                return <line key={i}
                  x1={72 + r1 * Math.cos(a)} y1={72 + r1 * Math.sin(a)}
                  x2={72 + r2 * Math.cos(a)} y2={72 + r2 * Math.sin(a)}
                  stroke={major ? "#3a3a3a" : minor ? "#2a2a2a" : "#1a1a1a"}
                  strokeWidth={major ? 1.5 : 0.8}/>
              })}
              {/* Cardinal labels */}
              {(["N","NE","E","SE","S","SW","W","NW"] as const).map((d, i) => {
                const a = (i * 45 - 90) * (Math.PI / 180)
                const major = i % 2 === 0
                return major ? (
                  <text key={d}
                    x={72 + 42 * Math.cos(a)} y={72 + 42 * Math.sin(a)}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={d === "N" ? "12" : "9"}
                    fill={d === "N" ? "#9ca3af" : "#374151"}
                    fontFamily="monospace" fontWeight={d === "N" ? "bold" : "normal"}>
                    {d}
                  </text>
                ) : null
              })}
              {/* Arrow — ref'd directly, updated by compass handler at 60 Hz */}
              <g ref={arrowElRef} style={{ transformOrigin: "72px 72px" }}>
                {/* North needle (green) */}
                <polygon points="72,14 76,66 68,66" fill="#22c55e" opacity="0.95"/>
                {/* South needle (dim) */}
                <polygon points="72,130 76,78 68,78" fill="#1f3a1f" opacity="0.7"/>
                {/* Centre */}
                <circle cx="72" cy="72" r="5" fill="#22c55e"/>
                <circle cx="72" cy="72" r="2.5" fill="#0a0a0a"/>
              </g>
            </svg>
            <p className="text-xs text-gray-500 text-center">
              Arrow points toward the device.{" "}
              <span className="text-gray-700">Walk in that direction.</span>
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <svg viewBox="0 0 80 80" className="w-16 h-16 mx-auto mb-3 opacity-10">
              <circle cx="40" cy="40" r="36" fill="none" stroke="#4b5563" strokeWidth="1"/>
              <polygon points="40,8 44,38 36,38" fill="#4b5563"/>
              <circle cx="40" cy="40" r="3" fill="#4b5563"/>
            </svg>
            <p className="text-xs text-gray-600">
              {geoStatus !== "ok"
                ? "Waiting for GPS…"
                : readings.length < 3
                ? `Walk around to collect signal data (${readings.length}/3)`
                : "Keep moving — arrow appears once you've covered some distance"}
            </p>
          </div>
        )}
      </div>

      {/* ── Signal history ── */}
      {readings.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-600 uppercase tracking-wider">Signal History</p>
            <span className="text-[10px] text-gray-700">{readings.length} pts</span>
          </div>
          <div className="flex items-end gap-px h-10">
            {readings.slice(-60).map((rd, i, arr) => {
              const s   = rssiToStrength(rd.rssi)
              const col = s > 0.65 ? "#22c55e" : s > 0.35 ? "#eab308" : "#ef4444"
              return <div key={i} className="flex-1 rounded-sm"
                style={{ height: `${Math.max(8, s * 100)}%`, background: col, opacity: 0.2 + (i / arr.length) * 0.8 }}/>
            })}
          </div>
          {bestReading && (
            <p className="text-[10px] text-gray-700 mt-1.5">
              Best: {bestReading.rssi} dBm · {fmtDist(rssiToMetres(bestReading.rssi))}
              {" · "}{new Date(bestReading.ts).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {/* ── Status ── */}
      <div className="card p-4 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <span className="text-xs text-gray-600 shrink-0">GPS</span>
          <span className={`text-xs font-mono text-right truncate ${
            geoStatus === "ok" ? "text-green-500"
            : geoStatus === "denied" ? "text-red-400"
            : "text-gray-600"}`}>
            {geoStatus === "ok" && pos
              ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`
              : geoStatus === "waiting" ? "Requesting permission…"
              : geoMsg}
          </span>
        </div>
        {pos && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">GPS Accuracy</span>
            <span className="text-xs text-gray-500">±{Math.round(pos.accuracy)} m</span>
          </div>
        )}
        {bleMsg && bleStatus === "unavailable" && (
          <p className="text-[11px] text-yellow-700">{bleMsg}</p>
        )}
      </div>
    </div>
  )
}

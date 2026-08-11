"use client"
import { useState } from "react"

type Pin = { id: string; name: string; lat: number | null; lng: number | null; type: "mission" | "target" | "villain"; detail?: string }

function latLngToXY(lat: number, lng: number): [number, number] {
  const x = ((lng + 180) / 360) * 1000
  const y = ((90 - lat) / 180) * 500
  return [x, y]
}

export default function MapClient({ missions, targets, villains }: {
  missions: { id: string; title: string; lat: number | null; lng: number | null; status: string; location: string | null }[]
  targets: { id: string; name: string; lat: number | null; lng: number | null; threatLevel: string; lastLocation: string | null }[]
  villains: { id: string; name: string; lat: number | null; lng: number | null; threatLevel: string; lastLocation: string | null }[]
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [filter, setFilter] = useState<string[]>(["mission", "target", "villain"])

  const pins: Pin[] = [
    ...missions.filter(m => m.lat && m.lng).map(m => ({ id: m.id, name: m.title, lat: m.lat!, lng: m.lng!, type: "mission" as const, detail: m.location ?? "" })),
    ...targets.filter(t => t.lat && t.lng).map(t => ({ id: t.id, name: t.name, lat: t.lat!, lng: t.lng!, type: "target" as const, detail: t.threatLevel })),
    ...villains.filter(v => v.lat && v.lng).map(v => ({ id: v.id, name: v.name, lat: v.lat!, lng: v.lng!, type: "villain" as const, detail: v.threatLevel })),
  ]

  const pinColor = (type: string) => type === "mission" ? "#22c55e" : type === "target" ? "#eab308" : "#ef4444"

  return (
    <div className="p-6 max-w-6xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Global Operations</p>
      <h1 className="text-xl font-semibold text-gray-100 mb-4">Field Map</h1>

      <div className="flex gap-2 mb-4">
        {[["mission","Missions","text-green-400"],["target","Targets","text-yellow-400"],["villain","Villains","text-red-400"]].map(([type, label, color]) => (
          <button key={type} onClick={() => setFilter(prev => prev.includes(type) ? prev.filter(f => f !== type) : [...prev, type])}
            className={`btn text-xs px-3 py-1.5 uppercase tracking-wider ${filter.includes(type) ? "btn-silver" : "btn-ghost"}`}>
            <span className={color}>●</span> {label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden scanlines relative" style={{ aspectRatio: "2/1" }}>
        <svg viewBox="0 0 1000 500" className="w-full h-full bg-[#050a05]" preserveAspectRatio="xMidYMid meet">
          {/* Grid */}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`v${i}`} x1={(i + 1) * 100} y1="0" x2={(i + 1) * 100} y2="500" stroke="#0f1f0f" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={(i + 1) * 100} x2="1000" y2={(i + 1) * 100} stroke="#0f1f0f" strokeWidth="0.5" />
          ))}
          {/* Equator */}
          <line x1="0" y1="250" x2="1000" y2="250" stroke="#1a2a1a" strokeWidth="0.5" />
          {/* Prime meridian */}
          <line x1="500" y1="0" x2="500" y2="500" stroke="#1a2a1a" strokeWidth="0.5" />

          {/* World outline (simplified continents as paths) */}
          {/* North America */}
          <path d="M 80,80 L 130,70 L 200,100 L 230,150 L 210,200 L 180,250 L 150,280 L 120,270 L 100,220 L 80,150 Z" fill="#0a150a" stroke="#1a2a1a" strokeWidth="0.8"/>
          {/* South America */}
          <path d="M 170,290 L 220,280 L 250,320 L 260,380 L 240,440 L 200,460 L 175,430 L 160,370 L 165,320 Z" fill="#0a150a" stroke="#1a2a1a" strokeWidth="0.8"/>
          {/* Europe */}
          <path d="M 440,80 L 500,70 L 530,90 L 540,120 L 510,140 L 480,150 L 450,130 L 430,100 Z" fill="#0a150a" stroke="#1a2a1a" strokeWidth="0.8"/>
          {/* Africa */}
          <path d="M 450,160 L 520,155 L 560,190 L 570,270 L 540,360 L 490,400 L 450,380 L 430,300 L 440,220 L 450,160 Z" fill="#0a150a" stroke="#1a2a1a" strokeWidth="0.8"/>
          {/* Asia */}
          <path d="M 540,70 L 700,60 L 800,80 L 830,130 L 800,170 L 750,190 L 700,200 L 650,180 L 600,160 L 560,130 L 540,100 Z" fill="#0a150a" stroke="#1a2a1a" strokeWidth="0.8"/>
          {/* Southeast Asia + Australia */}
          <path d="M 730,220 L 790,210 L 820,240 L 810,280 L 775,290 L 740,270 Z" fill="#0a150a" stroke="#1a2a1a" strokeWidth="0.8"/>
          <path d="M 790,320 L 870,310 L 900,340 L 890,390 L 840,410 L 790,390 L 775,355 Z" fill="#0a150a" stroke="#1a2a1a" strokeWidth="0.8"/>

          {/* Pins */}
          {pins.filter(p => filter.includes(p.type)).map(pin => {
            const [x, y] = latLngToXY(pin.lat!, pin.lng!)
            return (
              <g key={pin.id} className="cursor-pointer"
                onMouseEnter={() => setTooltip({ x, y, text: `${pin.name}${pin.detail ? ` · ${pin.detail}` : ""}` })}
                onMouseLeave={() => setTooltip(null)}>
                <circle cx={x} cy={y} r={6} fill={pinColor(pin.type)} opacity={0.9} />
                <circle cx={x} cy={y} r={10} fill="none" stroke={pinColor(pin.type)} strokeWidth={1} opacity={0.4} />
              </g>
            )
          })}

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect x={tooltip.x + 12} y={tooltip.y - 18} width={Math.min(tooltip.text.length * 6.5, 200)} height={22} rx={3} fill="#111" stroke="#2a2a2a" strokeWidth={0.5} />
              <text x={tooltip.x + 18} y={tooltip.y - 3} fontSize={10} fill="#d1d5db">{tooltip.text.slice(0, 28)}</text>
            </g>
          )}
        </svg>
      </div>

      <div className="mt-4 card p-4">
        <p className="text-xs text-gray-600 mb-2">Map pins show items with coordinates. To add coordinates, edit a mission/target/villain and set lat/lng.</p>
        <div className="flex gap-4 text-xs text-gray-600">
          <span><span className="text-green-400">●</span> Missions ({missions.filter(m=>m.lat&&m.lng).length})</span>
          <span><span className="text-yellow-400">●</span> Targets ({targets.filter(t=>t.lat&&t.lng).length})</span>
          <span><span className="text-red-400">●</span> Villains ({villains.filter(v=>v.lat&&v.lng).length})</span>
        </div>
      </div>
    </div>
  )
}

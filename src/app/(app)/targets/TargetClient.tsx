"use client"
import { useState } from "react"
import { threatColor, statusColor, formatDate } from "@/lib/utils"

type Target = { id: string; name: string; alias: string | null; threatLevel: string; status: string; nationality: string | null; lastLocation: string | null; notes: string | null; createdAt: string }

export default function TargetClient({ targets: initial }: { targets: Target[] }) {
  const [targets, setTargets] = useState(initial)
  const [selected, setSelected] = useState<Target | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState("")
  const [form, setForm] = useState({ name: "", alias: "", threatLevel: "medium", status: "active", nationality: "", lastLocation: "", notes: "" })
  const [loading, setLoading] = useState(false)

  const filtered = targets.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.alias ?? "").toLowerCase().includes(search.toLowerCase())
  )

  async function createTarget() {
    setLoading(true)
    const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (res.ok) {
      const t = await res.json()
      setTargets(prev => [t, ...prev])
      setShowNew(false)
      setForm({ name: "", alias: "", threatLevel: "medium", status: "active", nationality: "", lastLocation: "", notes: "" })
    }
    setLoading(false)
  }

  async function updateTarget(id: string, data: Partial<Target>) {
    await fetch(`/api/targets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    setTargets(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
    setSelected(prev => prev?.id === id ? { ...prev, ...data } : prev)
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Field Intelligence</p>
          <h1 className="text-xl font-semibold text-gray-100">Target Database</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-silver text-xs tracking-wider uppercase">+ Add Target</button>
      </div>

      <div className="mb-4">
        <input className="input max-w-sm" placeholder="Search targets…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4">New Target Profile</h2>
            <div className="space-y-3">
              <input className="input" placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input className="input" placeholder="Alias / Codename" value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={form.threatLevel} onChange={e => setForm(f => ({ ...f, threatLevel: e.target.value }))}>
                  <option value="low">Low threat</option>
                  <option value="medium">Medium threat</option>
                  <option value="high">High threat</option>
                  <option value="critical">Critical</option>
                </select>
                <input className="input" placeholder="Nationality" value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} />
              </div>
              <input className="input" placeholder="Last known location" value={form.lastLocation} onChange={e => setForm(f => ({ ...f, lastLocation: e.target.value }))} />
              <textarea rows={2} className="input resize-none" placeholder="Notes (classified)…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={createTarget} disabled={!form.name || loading} className="btn btn-silver flex-1 justify-center text-xs uppercase tracking-wider">{loading ? "Adding…" : "Add Target"}</button>
              <button onClick={() => setShowNew(false)} className="btn btn-ghost text-xs uppercase tracking-wider">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-gray-700 text-sm py-8 text-center">No targets on file.</p>}
          {filtered.map(t => (
            <div key={t.id} onClick={() => setSelected(t)}
              className={`card p-4 cursor-pointer transition-all hover:border-[#2a2a2a] ${selected?.id === t.id ? "border-gray-600" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-200">{t.name}</p>
                  {t.alias && <p className="text-xs text-gray-600 mt-0.5">aka {t.alias}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`badge text-[10px] ${threatColor(t.threatLevel)}`}>{t.threatLevel}</span>
                    <span className={`badge text-[10px] ${statusColor(t.status)}`}>{t.status}</span>
                  </div>
                </div>
                {t.lastLocation && <p className="text-xs text-gray-700">⌖ {t.lastLocation}</p>}
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-200">{selected.name}</h2>
                {selected.alias && <p className="text-sm text-gray-600">aka {selected.alias}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-700 hover:text-gray-400 text-lg">×</button>
            </div>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between py-2 border-b border-[#1a1a1a]">
                <span className="text-gray-600">Threat Level</span>
                <span className={`badge ${threatColor(selected.threatLevel)}`}>{selected.threatLevel}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#1a1a1a]">
                <span className="text-gray-600">Status</span>
                <span className={`badge ${statusColor(selected.status)}`}>{selected.status}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#1a1a1a]">
                <span className="text-gray-600">Nationality</span>
                <span className="text-gray-400">{selected.nationality ?? "Unknown"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#1a1a1a]">
                <span className="text-gray-600">Last Location</span>
                <span className="text-gray-400">{selected.lastLocation ?? "Unknown"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#1a1a1a]">
                <span className="text-gray-600">Added</span>
                <span className="text-gray-400">{formatDate(selected.createdAt)}</span>
              </div>
            </div>
            {selected.notes && <p className="text-sm text-gray-500 bg-[#111] rounded p-3 mb-4">{selected.notes}</p>}
            <div className="flex gap-2 flex-wrap">
              {["active","neutralized","captured","eliminated","unknown"].map(s => (
                <button key={s} onClick={() => updateTarget(selected.id, { status: s })}
                  className={`btn text-[11px] uppercase tracking-wider px-3 py-1.5 ${selected.status === s ? "btn-silver" : "btn-ghost"}`}>{s}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

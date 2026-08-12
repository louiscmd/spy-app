"use client"
import { useState } from "react"
import { threatColor, statusColor, formatDate } from "@/lib/utils"

type Villain = { id: string; name: string; alias: string | null; organization: string | null; threatLevel: string; status: string; specialty: string | null; lastLocation: string | null; bio: string | null; createdAt: string }

export default function VillainClient({ villains: initial }: { villains: Villain[] }) {
  const [villains, setVillains] = useState(initial)
  const [selected, setSelected] = useState<Villain | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: "", alias: "", organization: "", threatLevel: "high", status: "active", specialty: "", lastLocation: "", bio: "" })
  const [loading, setLoading] = useState(false)

  async function create() {
    setLoading(true)
    const res = await fetch("/api/villains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (res.ok) {
      const v = await res.json()
      setVillains(prev => [v, ...prev])
      setShowNew(false)
      setForm({ name: "", alias: "", organization: "", threatLevel: "high", status: "active", specialty: "", lastLocation: "", bio: "" })
    }
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/villains/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    setVillains(prev => prev.map(v => v.id === id ? { ...v, status } : v))
    setSelected(prev => prev?.id === id ? { ...prev, status } : prev)
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Rogues Gallery</p>
          <h1 className="text-xl font-semibold text-gray-100">Suspect Tracker</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-silver text-xs tracking-wider uppercase">+ Add Suspect</button>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4">New Suspect Profile</h2>
            <div className="space-y-3">
              <input className="input" placeholder="Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input className="input" placeholder="Alias" value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} />
              <input className="input" placeholder="Organization" value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} />
              <input className="input" placeholder="Specialty (e.g. nuclear weapons)" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={form.threatLevel} onChange={e => setForm(f => ({ ...f, threatLevel: e.target.value }))}>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <input className="input" placeholder="Last location" value={form.lastLocation} onChange={e => setForm(f => ({ ...f, lastLocation: e.target.value }))} />
              </div>
              <textarea rows={3} className="input resize-none" placeholder="Dossier / background…" value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={create} disabled={!form.name || loading} className="btn btn-silver flex-1 justify-center text-xs uppercase tracking-wider">{loading ? "Adding…" : "Add Suspect"}</button>
              <button onClick={() => setShowNew(false)} className="btn btn-ghost text-xs uppercase tracking-wider">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          {villains.length === 0 && <p className="text-gray-700 text-sm py-8 text-center">No suspects logged.</p>}
          {villains.map(v => (
            <div key={v.id} onClick={() => setSelected(v)}
              className={`card p-4 cursor-pointer transition-all hover:border-[#2a2a2a] ${selected?.id === v.id ? "border-gray-600" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-200">{v.name}</p>
                  {v.alias && <p className="text-xs text-gray-600">aka {v.alias}</p>}
                  {v.organization && <p className="text-xs text-gray-700 mt-0.5">⌀ {v.organization}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`badge text-[10px] ${threatColor(v.threatLevel)}`}>{v.threatLevel}</span>
                    <span className={`badge text-[10px] ${statusColor(v.status)}`}>{v.status}</span>
                  </div>
                </div>
                <span className="text-2xl opacity-30">☠</span>
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
            <div className="space-y-0 mb-4">
              {[
                ["Organization", selected.organization ?? "Unknown"],
                ["Specialty", selected.specialty ?? "Unknown"],
                ["Threat", selected.threatLevel],
                ["Status", selected.status],
                ["Last Location", selected.lastLocation ?? "Unknown"],
                ["Added", formatDate(selected.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-[#1a1a1a] text-sm">
                  <span className="text-gray-600">{k}</span>
                  <span className="text-gray-400">{v}</span>
                </div>
              ))}
            </div>
            {selected.bio && <p className="text-sm text-gray-500 bg-[#111] rounded p-3 mb-4">{selected.bio}</p>}
            <div className="flex gap-2 flex-wrap">
              {["active","captured","eliminated","unknown"].map(s => (
                <button key={s} onClick={() => updateStatus(selected.id, s)}
                  className={`btn text-[11px] uppercase tracking-wider px-3 py-1.5 ${selected.status === s ? "btn-silver" : "btn-ghost"}`}>{s}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

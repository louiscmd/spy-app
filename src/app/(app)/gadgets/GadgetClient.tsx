"use client"
import { useState } from "react"

const CATEGORY_ICONS: Record<string, string> = { surveillance: "👁", weapons: "⚡", transport: "🚗", comms: "📡", other: "⚙" }

type Gadget = { id: string; name: string; codename: string | null; description: string | null; status: string; category: string; createdAt: string }

export default function GadgetClient({ gadgets: initial }: { gadgets: Gadget[] }) {
  const [gadgets, setGadgets] = useState(initial)
  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter] = useState("all")
  const [form, setForm] = useState({ name: "", codename: "", description: "", status: "available", category: "surveillance" })
  const [loading, setLoading] = useState(false)

  const filtered = filter === "all" ? gadgets : gadgets.filter(g => g.category === filter || g.status === filter)

  async function create() {
    setLoading(true)
    const res = await fetch("/api/gadgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (res.ok) {
      const g = await res.json()
      setGadgets(prev => [g, ...prev])
      setShowNew(false)
      setForm({ name: "", codename: "", description: "", status: "available", category: "surveillance" })
    }
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/gadgets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    setGadgets(prev => prev.map(g => g.id === id ? { ...g, status } : g))
  }

  const statusColor = (s: string) => ({ available: "text-green-400 bg-green-400/5 border-green-400/20", deployed: "text-blue-400 bg-blue-400/5 border-blue-400/20", maintenance: "text-yellow-400 bg-yellow-400/5 border-yellow-400/20", destroyed: "text-red-400 bg-red-400/5 border-red-400/20" }[s] ?? "text-gray-400 bg-gray-400/5 border-gray-400/20")

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Q Branch Inventory</p>
          <h1 className="text-xl font-semibold text-gray-100">Gadget Inventory</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-silver text-xs uppercase tracking-wider">+ Add Gadget</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["all","surveillance","weapons","transport","comms","other","available","deployed","maintenance"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn text-xs px-3 py-1.5 uppercase tracking-wider ${filter === f ? "btn-silver" : "btn-ghost"}`}>{f}</button>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4">New Gadget</h2>
            <div className="space-y-3">
              <input className="input" placeholder="Gadget name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input className="input" placeholder="Codename" value={form.codename} onChange={e => setForm(f => ({ ...f, codename: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="surveillance">Surveillance</option>
                  <option value="weapons">Weapons</option>
                  <option value="transport">Transport</option>
                  <option value="comms">Comms</option>
                  <option value="other">Other</option>
                </select>
                <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="available">Available</option>
                  <option value="deployed">Deployed</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="destroyed">Destroyed</option>
                </select>
              </div>
              <textarea rows={2} className="input resize-none" placeholder="Description…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={create} disabled={!form.name || loading} className="btn btn-silver flex-1 justify-center text-xs uppercase tracking-wider">{loading ? "Adding…" : "Add to Inventory"}</button>
              <button onClick={() => setShowNew(false)} className="btn btn-ghost text-xs uppercase tracking-wider">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.length === 0 && <p className="text-gray-700 text-sm py-8 text-center col-span-3">No gadgets in inventory.</p>}
        {filtered.map(g => (
          <div key={g.id} className="card p-4">
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">{CATEGORY_ICONS[g.category] ?? "⚙"}</span>
              <span className={`badge text-[10px] ${statusColor(g.status)}`}>{g.status}</span>
            </div>
            <p className="text-sm font-medium text-gray-200 mb-0.5">{g.name}</p>
            {g.codename && <p className="text-xs text-gray-600 mb-2 font-mono">{g.codename}</p>}
            {g.description && <p className="text-xs text-gray-600 mb-3">{g.description}</p>}
            <div className="flex gap-1.5 flex-wrap">
              {["available","deployed","maintenance","destroyed"].map(s => (
                <button key={s} onClick={() => updateStatus(g.id, s)}
                  className={`text-[10px] px-2 py-1 rounded uppercase tracking-wide transition-all ${g.status === s ? "bg-[#2a2a2a] text-gray-200" : "text-gray-700 hover:text-gray-400"}`}>{s}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

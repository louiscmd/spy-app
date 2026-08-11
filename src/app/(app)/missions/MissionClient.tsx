"use client"
import { useState } from "react"
import { formatDate } from "@/lib/utils"

type Mission = {
  id: string; title: string; description: string | null; status: string
  priority: string; location: string | null; deadline: string | null
  createdAt: string
  logs: { id: string; content: string; createdAt: string }[]
}

export default function MissionClient({ missions: initial, userId }: { missions: Mission[]; userId: string }) {
  const [missions, setMissions] = useState(initial)
  const [selected, setSelected] = useState<Mission | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [logText, setLogText] = useState("")
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", location: "", deadline: "" })
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState("all")

  const filtered = filter === "all" ? missions : missions.filter(m => m.status === filter)

  async function createMission() {
    setLoading(true)
    const res = await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (res.ok) {
      const m = await res.json()
      setMissions(prev => [m, ...prev])
      setShowNew(false)
      setForm({ title: "", description: "", priority: "medium", location: "", deadline: "" })
    }
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/missions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    setMissions(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null)
  }

  async function addLog(missionId: string) {
    if (!logText.trim()) return
    const res = await fetch(`/api/missions/${missionId}/logs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: logText }) })
    if (res.ok) {
      const log = await res.json()
      setMissions(prev => prev.map(m => m.id === missionId ? { ...m, logs: [log, ...m.logs] } : m))
      setSelected(prev => prev?.id === missionId ? { ...prev, logs: [log, ...prev.logs] } : prev)
      setLogText("")
    }
  }

  const priorityColor = (p: string) => p === "critical" ? "text-red-400" : p === "high" ? "text-orange-400" : p === "medium" ? "text-yellow-400" : "text-green-400"

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Operations Centre</p>
          <h1 className="text-xl font-semibold text-gray-100">Mission Briefings</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-silver text-xs tracking-wider uppercase">+ New Mission</button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {["all","active","completed","failed","classified"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs uppercase tracking-wider transition-all ${filter === f ? "bg-[#1a1a1a] text-gray-200" : "text-gray-600 hover:text-gray-400"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* New mission modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4">New Mission Brief</h2>
            <div className="space-y-3">
              <input className="input" placeholder="Mission title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <textarea className="input resize-none" rows={3} placeholder="Classified briefing..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <input className="input" placeholder="Location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <input type="date" className="input" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={createMission} disabled={!form.title || loading} className="btn btn-silver flex-1 justify-center text-xs uppercase tracking-wider">
                {loading ? "Creating..." : "Create Mission"}
              </button>
              <button onClick={() => setShowNew(false)} className="btn btn-ghost text-xs uppercase tracking-wider">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Mission list */}
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-gray-700 text-sm py-8 text-center">No missions on record.</p>}
          {filtered.map(m => (
            <div key={m.id} onClick={() => setSelected(m)}
              className={`card p-4 cursor-pointer transition-all hover:border-[#2a2a2a] ${selected?.id === m.id ? "border-gray-600" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] uppercase font-mono ${priorityColor(m.priority)}`}>{m.priority}</span>
                    <span className={`badge text-[10px] ${m.status === "active" ? "text-green-400 border-green-400/20 bg-green-400/5" : m.status === "completed" ? "text-blue-400 border-blue-400/20 bg-blue-400/5" : "text-red-400 border-red-400/20 bg-red-400/5"}`}>{m.status}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-200 truncate">{m.title}</p>
                  {m.location && <p className="text-xs text-gray-600 mt-0.5">⌖ {m.location}</p>}
                </div>
                <span className="text-xs text-gray-700 shrink-0">{formatDate(m.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Mission detail */}
        {selected && (
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-200">{selected.title}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-700 hover:text-gray-400 text-lg">×</button>
            </div>
            {selected.description && <p className="text-sm text-gray-500 mb-4">{selected.description}</p>}
            <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
              <div><span className="text-gray-700">Priority: </span><span className={priorityColor(selected.priority)}>{selected.priority}</span></div>
              <div><span className="text-gray-700">Location: </span><span className="text-gray-400">{selected.location ?? "—"}</span></div>
              <div><span className="text-gray-700">Status: </span><span className="text-gray-400">{selected.status}</span></div>
              <div><span className="text-gray-700">Deadline: </span><span className="text-gray-400">{selected.deadline ? formatDate(selected.deadline) : "—"}</span></div>
            </div>
            {/* Status buttons */}
            <div className="flex gap-2 flex-wrap mb-4">
              {["active","completed","failed","classified"].map(s => (
                <button key={s} onClick={() => updateStatus(selected.id, s)}
                  className={`btn text-[11px] uppercase tracking-wider px-3 py-1.5 ${selected.status === s ? "btn-silver" : "btn-ghost"}`}>{s}</button>
              ))}
            </div>
            {/* Mission log */}
            <div className="border-t border-[#1a1a1a] pt-4">
              <h3 className="text-xs text-gray-600 uppercase tracking-wider mb-3">Field Log</h3>
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                {selected.logs.length === 0 && <p className="text-xs text-gray-700">No log entries.</p>}
                {selected.logs.map(log => (
                  <div key={log.id} className="bg-[#111] rounded p-2">
                    <p className="text-xs text-gray-400">{log.content}</p>
                    <p className="text-[10px] text-gray-700 mt-1">{formatDate(log.createdAt)}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input text-xs flex-1" placeholder="Add log entry…" value={logText} onChange={e => setLogText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addLog(selected.id)} />
                <button onClick={() => addLog(selected.id)} className="btn btn-silver text-xs px-3">Log</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

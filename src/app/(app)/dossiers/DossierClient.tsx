"use client"
import { useState } from "react"
import { formatDate } from "@/lib/utils"

const CLASS_COLOR: Record<string, string> = {
  "unclassified": "text-green-400 border-green-400/20 bg-green-400/5",
  "classified": "text-yellow-400 border-yellow-400/20 bg-yellow-400/5",
  "top-secret": "text-orange-400 border-orange-400/20 bg-orange-400/5",
  "eyes-only": "text-red-400 border-red-400/20 bg-red-400/5",
}

type Dossier = { id: string; title: string; content: string; classification: string; tags: string | null; createdAt: string; updatedAt: string }

export default function DossierClient({ dossiers: initial }: { dossiers: Dossier[] }) {
  const [dossiers, setDossiers] = useState(initial)
  const [selected, setSelected] = useState<Dossier | null>(null)
  const [editing, setEditing] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState("")
  const [form, setForm] = useState({ title: "", content: "", classification: "classified", tags: "" })
  const [loading, setLoading] = useState(false)

  const filtered = dossiers.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.tags ?? "").toLowerCase().includes(search.toLowerCase())
  )

  async function create() {
    setLoading(true)
    const res = await fetch("/api/dossiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (res.ok) {
      const d = await res.json()
      setDossiers(prev => [d, ...prev])
      setShowNew(false)
      setForm({ title: "", content: "", classification: "classified", tags: "" })
    }
    setLoading(false)
  }

  async function saveEdit(d: Dossier) {
    await fetch(`/api/dossiers/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: d.title, content: d.content, classification: d.classification, tags: d.tags }) })
    setDossiers(prev => prev.map(x => x.id === d.id ? d : x))
    setEditing(false)
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Intelligence Archives</p>
          <h1 className="text-xl font-semibold text-gray-100">Dossier System</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-silver text-xs uppercase tracking-wider">+ New Dossier</button>
      </div>

      <input className="input max-w-sm mb-4" placeholder="Search dossiers…" value={search} onChange={e => setSearch(e.target.value)} />

      {showNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-lg">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4">New Dossier</h2>
            <div className="space-y-3">
              <input className="input" placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={form.classification} onChange={e => setForm(f => ({ ...f, classification: e.target.value }))}>
                  <option value="unclassified">Unclassified</option>
                  <option value="classified">Classified</option>
                  <option value="top-secret">Top Secret</option>
                  <option value="eyes-only">Eyes Only</option>
                </select>
                <input className="input" placeholder="Tags (comma-separated)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
              </div>
              <textarea rows={8} className="input resize-none" placeholder="Dossier content…" value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={create} disabled={!form.title || !form.content || loading} className="btn btn-silver flex-1 justify-center text-xs uppercase tracking-wider">{loading ? "Saving…" : "Create Dossier"}</button>
              <button onClick={() => setShowNew(false)} className="btn btn-ghost text-xs uppercase tracking-wider">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-gray-700 text-sm py-8 text-center">No dossiers on file.</p>}
          {filtered.map(d => (
            <div key={d.id} onClick={() => { setSelected(d); setEditing(false) }}
              className={`card p-4 cursor-pointer hover:border-[#2a2a2a] transition-all ${selected?.id === d.id ? "border-gray-600" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{d.title}</p>
                  {d.tags && <p className="text-xs text-gray-700 mt-0.5">{d.tags}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`badge text-[10px] ${CLASS_COLOR[d.classification] ?? ""}`}>{d.classification}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-700 shrink-0">{formatDate(d.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <input className="input text-base font-semibold mb-2" value={selected.title} onChange={e => setSelected(prev => prev ? { ...prev, title: e.target.value } : null)} />
                ) : (
                  <h2 className="text-base font-semibold text-gray-200 mb-1">{selected.title}</h2>
                )}
                <div className="flex gap-2">
                  <span className={`badge text-[10px] ${CLASS_COLOR[selected.classification] ?? ""}`}>{selected.classification}</span>
                  <span className="text-xs text-gray-700">{formatDate(selected.updatedAt)}</span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0 ml-2">
                {editing ? (
                  <button onClick={() => saveEdit(selected)} className="btn btn-silver text-xs px-3 py-1.5">Save</button>
                ) : (
                  <button onClick={() => setEditing(true)} className="btn btn-ghost text-xs px-3 py-1.5">Edit</button>
                )}
                <button onClick={() => setSelected(null)} className="text-gray-700 hover:text-gray-400 text-lg ml-1">×</button>
              </div>
            </div>
            {editing ? (
              <textarea rows={12} className="input resize-none text-sm" value={selected.content}
                onChange={e => setSelected(prev => prev ? { ...prev, content: e.target.value } : null)} />
            ) : (
              <div className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">{selected.content}</div>
            )}
            {selected.tags && !editing && (
              <div className="flex gap-1.5 flex-wrap mt-4">
                {selected.tags.split(",").map(t => (
                  <span key={t} className="px-2 py-0.5 bg-[#111] text-xs text-gray-600 rounded">{t.trim()}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

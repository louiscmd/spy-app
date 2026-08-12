"use client"
import { useState } from "react"
import { encrypt, decrypt } from "@/lib/utils"

export default function DeadDropPage() {
  const [tab, setTab] = useState<"create" | "retrieve">("create")
  const [createForm, setCreateForm] = useState({ content: "", passphrase: "" })
  const [dropId, setDropId] = useState("")
  const [created, setCreated] = useState<{ id: string; passphrase: string } | null>(null)
  const [retrieved, setRetrieved] = useState<string | null>(null)
  const [retrieveError, setRetrieveError] = useState("")
  const [loading, setLoading] = useState(false)

  async function createDrop() {
    setLoading(true)
    const encrypted = encrypt(createForm.content, createForm.passphrase)
    const res = await fetch("/api/dead-drop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: encrypted, passphrase: createForm.passphrase }) })
    if (res.ok) {
      const data = await res.json()
      setCreated({ id: data.id, passphrase: createForm.passphrase })
      setCreateForm({ content: "", passphrase: "" })
    }
    setLoading(false)
  }

  async function retrieveDrop() {
    setLoading(true)
    setRetrieveError("")
    setRetrieved(null)
    const res = await fetch(`/api/dead-drop/${dropId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase: createForm.passphrase }) })
    if (!res.ok) {
      setRetrieveError("Access denied. Invalid ID or passphrase.")
    } else {
      const data = await res.json()
      setRetrieved(decrypt(data.content, createForm.passphrase))
    }
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-2xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Secure Drop</p>
      <h1 className="text-xl font-semibold text-gray-100 mb-2">Dead Drop</h1>
      <p className="text-sm text-gray-600 mb-6">Leave encrypted messages retrievable only with a secret passphrase. Viewed once — then destroyed.</p>

      <div className="flex gap-2 mb-6">
        {(["create","retrieve"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setCreated(null); setRetrieved(null); setRetrieveError("") }}
            className={`btn text-xs uppercase tracking-wider px-5 ${tab === t ? "btn-silver" : "btn-ghost"}`}>{t}</button>
        ))}
      </div>

      {tab === "create" && (
        <div className="card p-6">
          {created ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📦</div>
              <p className="text-sm font-medium text-gray-300 mb-1">Dead drop created</p>
              <p className="text-xs text-gray-600 mb-6">Share the ID and passphrase through a separate secure channel.</p>
              <div className="bg-[#050505] border border-[#1a1a1a] rounded p-4 text-left mb-4">
                <div className="mb-3">
                  <p className="text-[10px] text-gray-700 uppercase tracking-widest mb-1">Drop ID</p>
                  <p className="text-sm font-mono text-green-400">{created.id}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-700 uppercase tracking-widest mb-1">Passphrase</p>
                  <p className="text-sm font-mono text-yellow-400">{created.passphrase}</p>
                </div>
              </div>
              <button onClick={() => setCreated(null)} className="btn btn-ghost text-xs uppercase tracking-wider">Create another</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-600 uppercase tracking-wider block mb-1.5">Message</label>
                <textarea rows={5} className="input resize-none" placeholder="Classified intelligence…"
                  value={createForm.content} onChange={e => setCreateForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-600 uppercase tracking-wider block mb-1.5">Passphrase</label>
                <input className="input" placeholder="Secret passphrase for retrieval"
                  value={createForm.passphrase} onChange={e => setCreateForm(f => ({ ...f, passphrase: e.target.value }))} />
                <p className="text-[11px] text-gray-700 mt-1">Share this passphrase separately — it is NOT stored.</p>
              </div>
              <button onClick={createDrop} disabled={!createForm.content || !createForm.passphrase || loading}
                className="btn btn-silver w-full justify-center text-xs uppercase tracking-wider">
                {loading ? "Encrypting…" : "Create Dead Drop"}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "retrieve" && (
        <div className="card p-6">
          {retrieved ? (
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wider mb-3">Decrypted Message</p>
              <div className="bg-[#050505] border border-green-400/20 rounded p-4 text-sm text-green-400 font-mono whitespace-pre-wrap mb-4">{retrieved}</div>
              <p className="text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded p-2">⚠ This dead drop has been consumed and destroyed.</p>
              <button onClick={() => { setRetrieved(null); setDropId(""); setCreateForm(f => ({ ...f, passphrase: "" })) }} className="btn btn-ghost text-xs uppercase tracking-wider mt-4">Retrieve another</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-600 uppercase tracking-wider block mb-1.5">Drop ID</label>
                <input className="input" placeholder="Drop identifier" value={dropId} onChange={e => setDropId(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600 uppercase tracking-wider block mb-1.5">Passphrase</label>
                <input className="input" placeholder="Secret passphrase"
                  value={createForm.passphrase} onChange={e => setCreateForm(f => ({ ...f, passphrase: e.target.value }))} />
              </div>
              {retrieveError && <p className="text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded px-3 py-2">{retrieveError}</p>}
              <button onClick={retrieveDrop} disabled={!dropId || !createForm.passphrase || loading}
                className="btn btn-silver w-full justify-center text-xs uppercase tracking-wider">
                {loading ? "Retrieving…" : "Retrieve Drop"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

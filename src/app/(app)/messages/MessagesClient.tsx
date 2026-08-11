"use client"
import { useState } from "react"
import { formatDate, encrypt, decrypt } from "@/lib/utils"

const SESSION_KEY = "MI6COMMS2024"

type Msg = { id: string; content: string; senderId: string; receiverId: string; selfDestruct: boolean; read: boolean; createdAt: string; sender: { id: string; codename: string }; receiver: { id: string; codename: string } }
type Agent = { id: string; codename: string }

export default function MessagesClient({ messages: initial, agents, userId }: { messages: Msg[]; agents: Agent[]; userId: string }) {
  const [messages, setMessages] = useState(initial)
  const [showNew, setShowNew] = useState(false)
  const [decrypted, setDecrypted] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ receiverId: "", content: "", selfDestruct: false })
  const [loading, setLoading] = useState(false)

  async function send() {
    setLoading(true)
    const encrypted = encrypt(form.content, SESSION_KEY)
    const res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, content: encrypted }) })
    if (res.ok) {
      const msg = await res.json()
      setMessages(prev => [msg, ...prev])
      setShowNew(false)
      setForm({ receiverId: "", content: "", selfDestruct: false })
    }
    setLoading(false)
  }

  function toggleDecrypt(id: string, content: string) {
    if (decrypted[id]) {
      setDecrypted(prev => { const n = { ...prev }; delete n[id]; return n })
    } else {
      setDecrypted(prev => ({ ...prev, [id]: decrypt(content, SESSION_KEY) }))
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Secure Comms</p>
          <h1 className="text-xl font-semibold text-gray-100">Encrypted Messaging</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-silver text-xs uppercase tracking-wider">+ Compose</button>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4">Compose Secure Message</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600 uppercase tracking-wider block mb-1.5">Recipient</label>
                <select className="input" value={form.receiverId} onChange={e => setForm(f => ({ ...f, receiverId: e.target.value }))}>
                  <option value="">Select agent…</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.codename}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 uppercase tracking-wider block mb-1.5">Message (plaintext — will be encrypted)</label>
                <textarea rows={4} className="input resize-none" placeholder="Classified message…" value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.selfDestruct} onChange={e => setForm(f => ({ ...f, selfDestruct: e.target.checked }))} className="accent-gray-500" />
                <span className="text-xs text-gray-500">Self-destruct after reading</span>
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={send} disabled={!form.receiverId || !form.content || loading} className="btn btn-silver flex-1 justify-center text-xs uppercase tracking-wider">{loading ? "Sending…" : "Transmit"}</button>
              <button onClick={() => setShowNew(false)} className="btn btn-ghost text-xs uppercase tracking-wider">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {messages.length === 0 && <p className="text-gray-700 text-sm py-8 text-center">No transmissions on record.</p>}
        {messages.map(msg => {
          const isOwn = msg.senderId === userId
          const plain = decrypted[msg.id]
          return (
            <div key={msg.id} className={`card p-4 ${!msg.read && !isOwn ? "border-gray-600" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs text-gray-600">{isOwn ? "To:" : "From:"}</span>
                    <span className="text-xs font-medium text-gray-300">{isOwn ? msg.receiver.codename : msg.sender.codename}</span>
                    {msg.selfDestruct && <span className="badge text-[10px] text-red-400 border-red-400/20 bg-red-400/5">self-destruct</span>}
                    {!msg.read && !isOwn && <span className="badge text-[10px] text-blue-400 border-blue-400/20 bg-blue-400/5">new</span>}
                  </div>
                  <div className="font-mono text-xs bg-[#050505] border border-[#1a1a1a] rounded p-2 text-gray-700 break-all">
                    {plain ? <span className="text-green-400">{plain}</span> : msg.content.slice(0, 60) + "…"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-700 mb-2">{formatDate(msg.createdAt)}</p>
                  <button onClick={() => toggleDecrypt(msg.id, msg.content)} className="btn btn-ghost text-[10px] px-2 py-1 uppercase tracking-wider">
                    {plain ? "Lock" : "Decrypt"}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-800 mt-6 text-center">All messages encrypted with XOR cipher · Session key required to decrypt</p>
    </div>
  )
}

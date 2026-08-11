"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: "", password: "", codename: "", realName: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || "Registration failed")
      setLoading(false)
      return
    }
    router.push("/login?registered=1")
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-[#2a2a2a] bg-[#0a0a0a] mb-4">
            <span className="text-2xl font-bold text-gray-300 tracking-tighter">007</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-100 tracking-wider">NEW AGENT ENLISTMENT</h1>
          <p className="text-xs text-gray-600 mt-1 tracking-widest uppercase">MI6 — Classified Intake</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Codename *</label>
            <input className="input" placeholder="e.g. Nightshade, Falcon…"
              value={form.codename}
              onChange={e => setForm(f => ({ ...f, codename: e.target.value }))} required />
            <p className="text-[11px] text-gray-700 mt-1">Your unique operative alias</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Real Name</label>
            <input className="input" placeholder="Optional — classified"
              value={form.realName}
              onChange={e => setForm(f => ({ ...f, realName: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Secure Email *</label>
            <input type="email" className="input" placeholder="agent@mi6.gov.uk"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Passphrase *</label>
            <input type="password" className="input" placeholder="Min. 8 characters"
              value={form.password} minLength={8}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>
          )}
          <button type="submit" disabled={loading}
            className="w-full btn btn-silver justify-center py-2.5 tracking-wider uppercase text-xs mt-2">
            {loading ? "Submitting dossier..." : "Enlist as Agent"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Already active?{" "}
          <Link href="/login" className="text-gray-400 hover:text-gray-200 underline underline-offset-2">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}

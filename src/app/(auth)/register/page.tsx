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
          <div className="inline-flex items-center justify-center w-14 h-14 mb-5">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <polygon points="50,8 95,92 5,92" fill="white"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-100 tracking-wider">SPY APP</h1>
          <p className="text-xs text-gray-600 mt-1 tracking-widest uppercase">Create an account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Username *</label>
            <input className="input" placeholder="Choose a username"
              value={form.codename}
              onChange={e => setForm(f => ({ ...f, codename: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Full Name</label>
            <input className="input" placeholder="Optional"
              value={form.realName}
              onChange={e => setForm(f => ({ ...f, realName: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Email *</label>
            <input type="email" className="input" placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Password *</label>
            <input type="password" className="input" placeholder="Min. 8 characters"
              value={form.password} minLength={8}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>
          )}
          <button type="submit" disabled={loading}
            className="w-full btn btn-silver justify-center py-2.5 tracking-wider uppercase text-xs mt-2">
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-gray-400 hover:text-gray-200 underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

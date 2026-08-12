"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await signIn("credentials", { email, password, redirect: false })
    if (res?.error) {
      setError("Invalid credentials.")
      setLoading(false)
    } else {
      router.push("/dashboard")
    }
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
          <p className="text-xs text-gray-600 mt-1 tracking-widest uppercase">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="input" placeholder="you@example.com" required />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest block mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="input" placeholder="••••••••" required />
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>
          )}
          <button type="submit" disabled={loading}
            className="w-full btn btn-silver justify-center py-2.5 tracking-wider uppercase text-xs mt-2">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          No account?{" "}
          <Link href="/register" className="text-gray-400 hover:text-gray-200 underline underline-offset-2">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}

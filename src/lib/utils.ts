import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getRankFromXP(xp: number): string {
  if (xp >= 10000) return "00-Agent"
  if (xp >= 7500) return "Senior Agent"
  if (xp >= 5000) return "Field Agent"
  if (xp >= 2500) return "Junior Agent"
  if (xp >= 1000) return "Operative"
  if (xp >= 500) return "Recruit"
  return "Trainee"
}

export function getXPForNextRank(xp: number): { current: string; next: string; needed: number; progress: number } {
  const ranks = [
    { name: "Trainee", min: 0 },
    { name: "Recruit", min: 500 },
    { name: "Operative", min: 1000 },
    { name: "Junior Agent", min: 2500 },
    { name: "Field Agent", min: 5000 },
    { name: "Senior Agent", min: 7500 },
    { name: "00-Agent", min: 10000 },
  ]
  const current = ranks.findLast(r => xp >= r.min) ?? ranks[0]
  const nextIndex = ranks.indexOf(current) + 1
  const next = ranks[nextIndex]
  if (!next) return { current: current.name, next: "MAX", needed: 0, progress: 100 }
  const progress = Math.round(((xp - current.min) / (next.min - current.min)) * 100)
  return { current: current.name, next: next.name, needed: next.min - xp, progress }
}

export function encrypt(text: string, key: string): string {
  // Simple XOR cipher for demo (client-side)
  return btoa(text.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(""))
}

export function decrypt(encoded: string, key: string): string {
  try {
    const text = atob(encoded)
    return text.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join("")
  } catch {
    return "[DECRYPTION FAILED]"
  }
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function threatColor(level: string) {
  switch (level) {
    case "critical": return "text-red-400 bg-red-400/10 border-red-400/20"
    case "high": return "text-orange-400 bg-orange-400/10 border-orange-400/20"
    case "medium": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
    default: return "text-green-400 bg-green-400/10 border-green-400/20"
  }
}

export function statusColor(status: string) {
  switch (status) {
    case "active": return "text-green-400 bg-green-400/10"
    case "completed": return "text-blue-400 bg-blue-400/10"
    case "failed": return "text-red-400 bg-red-400/10"
    case "captured": return "text-blue-400 bg-blue-400/10"
    case "neutralized": return "text-gray-400 bg-gray-400/10"
    case "eliminated": return "text-red-400 bg-red-400/10"
    default: return "text-gray-400 bg-gray-400/10"
  }
}

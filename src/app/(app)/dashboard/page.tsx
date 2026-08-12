import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getRankFromXP, formatDate } from "@/lib/utils"
import Link from "next/link"

export default async function Dashboard() {
  const session = await auth()
  const userId = session!.user!.id!

  const [user, missions, targets, villains, messages] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { achievements: { include: { achievement: true } } } }),
    prisma.mission.findMany({ where: { agentId: userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.target.count(),
    prisma.villain.count({ where: { status: "active" } }),
    prisma.message.count({ where: { receiverId: userId, read: false } }),
  ])

  const activeMissions = missions.filter(m => m.status === "active").length
  const rank = getRankFromXP(user?.xp ?? 0)

  const stats = [
    { label: "Active Missions", value: activeMissions, icon: "◎", href: "/missions", color: "text-green-400" },
    { label: "Known Targets", value: targets, icon: "⊕", href: "/targets", color: "text-yellow-400" },
    { label: "Active Suspects", value: villains, icon: "☠", href: "/villains", color: "text-red-400" },
    { label: "Unread Comms", value: messages, icon: "▣", href: "/messages", color: "text-blue-400" },
  ]

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Operations Center</p>
        <h1 className="text-2xl font-semibold text-gray-100">
          Welcome back, <span className="text-gray-400">{user?.codename}</span>
        </h1>
        <p className="text-sm text-gray-600 mt-1">{rank} · {user?.xp.toLocaleString()} XP</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {stats.map(s => (
          <Link key={s.label} href={s.href}
            className="card p-4 hover:border-[#2a2a2a] transition-all group">
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xl font-mono ${s.color}`}>{s.icon}</span>
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            </div>
            <p className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent missions */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Recent Missions</h2>
            <Link href="/missions" className="text-xs text-gray-600 hover:text-gray-400">View all →</Link>
          </div>
          {missions.length === 0 ? (
            <p className="text-sm text-gray-700 py-4 text-center">No missions on record.</p>
          ) : (
            <div className="space-y-2">
              {missions.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-[#1a1a1a] last:border-0">
                  <div>
                    <p className="text-sm text-gray-300">{m.title}</p>
                    <p className="text-xs text-gray-700">{m.location ?? "Location classified"}</p>
                  </div>
                  <span className={`badge text-[10px] ${
                    m.status === "active" ? "text-green-400 border-green-400/20 bg-green-400/5"
                    : m.status === "completed" ? "text-blue-400 border-blue-400/20 bg-blue-400/5"
                    : "text-red-400 border-red-400/20 bg-red-400/5"
                  }`}>{m.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Achievements */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Achievements</h2>
            <Link href="/status" className="text-xs text-gray-600 hover:text-gray-400">View all →</Link>
          </div>
          {(user?.achievements?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-700 py-4 text-center">Complete missions to unlock achievements.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {user?.achievements?.slice(0, 8).map(ua => (
                <div key={ua.id} className="flex flex-col items-center gap-1 p-2 bg-[#111] rounded-md">
                  <span className="text-xl">{ua.achievement.icon}</span>
                  <span className="text-[10px] text-gray-600 text-center leading-tight">{ua.achievement.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/missions", label: "New Mission", icon: "+" },
          { href: "/targets", label: "Add Target", icon: "⊕" },
          { href: "/messages", label: "Send Comms", icon: "▣" },
          { href: "/radar", label: "BT Radar", icon: "◌" },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="btn btn-ghost justify-center py-3 text-xs tracking-wider uppercase">
            <span className="font-mono mr-1">{a.icon}</span> {a.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

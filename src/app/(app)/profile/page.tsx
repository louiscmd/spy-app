import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getRankFromXP, getXPForNextRank, formatDate } from "@/lib/utils"

export default async function ProfilePage() {
  const session = await auth()
  const user = await prisma.user.findUnique({
    where: { id: session!.user!.id! },
    include: {
      missions: true,
      achievements: { include: { achievement: true } },
    },
  })
  if (!user) return null

  const rankInfo = getXPForNextRank(user.xp)
  const completed = user.missions.filter(m => m.status === "completed").length
  const active = user.missions.filter(m => m.status === "active").length

  return (
    <div className="p-6 max-w-3xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-6">Agent Dossier</p>

      {/* Profile card */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-6">
          <div className="shrink-0 w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-gray-200 border border-[#2a2a2a]"
            style={{ background: user.avatarColor + "22", borderColor: user.avatarColor + "44" }}>
            {user.codename.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-gray-100">{user.codename}</h1>
            {user.realName && <p className="text-sm text-gray-600 mt-0.5">{user.realName}</p>}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="badge text-[11px] text-gray-300 border-gray-700 bg-[#1a1a1a]">{rankInfo.current}</span>
              <span className="text-xs text-gray-600">{user.xp.toLocaleString()} XP</span>
              <span className="text-xs text-gray-700">Enlisted {formatDate(user.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* XP Bar */}
        {rankInfo.next !== "MAX" && (
          <div className="mt-6">
            <div className="flex justify-between text-xs text-gray-600 mb-1.5">
              <span>{rankInfo.current}</span>
              <span>{rankInfo.needed} XP to {rankInfo.next}</span>
            </div>
            <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div className="h-full bg-gray-400 rounded-full transition-all" style={{ width: `${rankInfo.progress}%` }} />
            </div>
          </div>
        )}
        {rankInfo.next === "MAX" && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Maximum rank achieved</span>
              <span className="text-gold-400">00-Agent ★</span>
            </div>
            <div className="h-1.5 bg-gray-400 rounded-full" />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Active Missions", value: active },
          { label: "Completed", value: completed },
          { label: "Badges", value: user.achievements.length },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-200 mb-1">{s.value}</p>
            <p className="text-xs text-gray-600">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div className="card p-5">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Badges Earned</h2>
        {user.achievements.length === 0 ? (
          <p className="text-sm text-gray-700 text-center py-6">No badges yet. Complete missions to earn them.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {user.achievements.map(ua => (
              <div key={ua.id} className="bg-[#111] rounded-lg p-3 flex flex-col items-center gap-2 text-center">
                <span className="text-2xl">{ua.achievement.icon}</span>
                <p className="text-xs font-medium text-gray-300">{ua.achievement.title}</p>
                <p className="text-[10px] text-gray-600">{ua.achievement.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

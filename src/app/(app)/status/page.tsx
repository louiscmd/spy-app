import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getXPForNextRank, formatDate } from "@/lib/utils"

export default async function StatusPage() {
  const session = await auth()
  const user = await prisma.user.findUnique({
    where: { id: session!.user!.id! },
    include: {
      missions: true,
      achievements: { include: { achievement: true }, orderBy: { unlockedAt: "desc" } },
    },
  })
  const allAchievements = await prisma.achievement.findMany()
  if (!user) return null

  const rankInfo = getXPForNextRank(user.xp)
  const unlockedIds = new Set(user.achievements.map(a => a.achievementId))

  const ranks = [
    { name: "Trainee", xp: 0 },
    { name: "Recruit", xp: 500 },
    { name: "Operative", xp: 1000 },
    { name: "Junior Agent", xp: 2500 },
    { name: "Field Agent", xp: 5000 },
    { name: "Senior Agent", xp: 7500 },
    { name: "00-Agent", xp: 10000 },
  ]

  return (
    <div className="p-6 max-w-4xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Operative Status</p>
      <h1 className="text-xl font-semibold text-gray-100 mb-6">00 Status</h1>

      {/* Rank card */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-3xl font-bold text-gray-200 mb-1">{rankInfo.current}</p>
            <p className="text-sm text-gray-600">{user.xp.toLocaleString()} XP earned</p>
          </div>
          {rankInfo.current === "00-Agent" && (
            <div className="text-5xl opacity-70">🔫</div>
          )}
        </div>
        {rankInfo.next !== "MAX" ? (
          <>
            <div className="flex justify-between text-xs text-gray-600 mb-2">
              <span>{rankInfo.current}</span>
              <span>{rankInfo.needed.toLocaleString()} XP needed for {rankInfo.next}</span>
            </div>
            <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-gray-600 to-gray-400 rounded-full transition-all"
                style={{ width: `${rankInfo.progress}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-yellow-400">Maximum operative rank achieved — Top clearance achieved ✓</p>
        )}
      </div>

      {/* Rank ladder */}
      <div className="card p-5 mb-6">
        <h2 className="text-xs text-gray-600 uppercase tracking-wider mb-4">Rank Progression</h2>
        <div className="space-y-2">
          {ranks.map(r => {
            const achieved = user.xp >= r.xp
            const isCurrent = rankInfo.current === r.name
            return (
              <div key={r.name} className={`flex items-center justify-between py-2 border-b border-[#1a1a1a] last:border-0 ${isCurrent ? "opacity-100" : achieved ? "opacity-60" : "opacity-25"}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-mono ${achieved ? "text-green-400" : "text-gray-700"}`}>{achieved ? "✓" : "○"}</span>
                  <span className={`text-sm ${isCurrent ? "text-gray-100 font-medium" : "text-gray-400"}`}>{r.name}</span>
                  {isCurrent && <span className="badge text-[10px] text-blue-400 border-blue-400/20 bg-blue-400/5">current</span>}
                </div>
                <span className="text-xs text-gray-700 font-mono">{r.xp.toLocaleString()} XP</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* All achievements */}
      <div className="card p-5">
        <h2 className="text-xs text-gray-600 uppercase tracking-wider mb-4">Achievements ({user.achievements.length}/{allAchievements.length})</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allAchievements.map(a => {
            const ua = user.achievements.find(x => x.achievementId === a.id)
            const unlocked = unlockedIds.has(a.id)
            return (
              <div key={a.id} className={`bg-[#0a0a0a] border rounded-lg p-4 transition-all ${unlocked ? "border-[#2a2a2a]" : "border-[#111] opacity-40"}`}>
                <div className="flex items-start gap-3">
                  <span className={`text-2xl ${unlocked ? "" : "grayscale"}`}>{a.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${unlocked ? "text-gray-200" : "text-gray-600"}`}>{a.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{a.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-700">+{a.xpReward} XP</span>
                      {ua && <span className="text-[10px] text-gray-700">{formatDate(ua.unlockedAt)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const { email, password, codename, realName } = await req.json()
  if (!email || !password || !codename) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { codename }] },
  })
  if (existing) {
    return NextResponse.json({ error: "Email or codename already taken" }, { status: 409 })
  }
  const hashed = await bcrypt.hash(password, 12)
  const colors = ["#6c757d","#495057","#adb5bd","#7c8a93","#5f7a8a"]
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      codename,
      realName: realName || null,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
    },
  })
  // Seed default achievements
  try {
    const achievements = await prisma.achievement.findMany()
    if (achievements.length === 0) {
      await prisma.achievement.createMany({
        data: [
          { key: "first_mission", title: "First Blood", description: "Complete your first mission", icon: "🎯", xpReward: 200 },
          { key: "five_missions", title: "Seasoned Operative", description: "Complete 5 missions", icon: "⭐", xpReward: 500 },
          { key: "first_target", title: "Eyes On", description: "Add your first target", icon: "👁️", xpReward: 100 },
          { key: "first_message", title: "Secure Channel", description: "Send your first encrypted message", icon: "🔐", xpReward: 150 },
          { key: "dead_drop", title: "Ghost Protocol", description: "Create a dead drop", icon: "📦", xpReward: 250 },
          { key: "cipher_master", title: "Cipher Master", description: "Decode 10 messages with the cipher tool", icon: "🔑", xpReward: 300 },
          { key: "villain_caught", title: "Nemesis", description: "Capture or neutralize a villain", icon: "💀", xpReward: 750 },
          { key: "ten_gadgets", title: "Q Branch Favourite", description: "Collect 10 gadgets", icon: "🔧", xpReward: 400 },
          { key: "double_o", title: "License to Kill", description: "Reach 00-Agent status", icon: "🔫", xpReward: 2000 },
        ],
      })
    }
  } catch {}
  return NextResponse.json({ id: user.id })
}

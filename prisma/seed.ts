import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  await prisma.achievement.createMany({
    skipDuplicates: true,
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
  console.log("Achievements seeded")
}

main().catch(console.error).finally(() => prisma.$disconnect())

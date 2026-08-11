import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import MessagesClient from "./MessagesClient"

export default async function MessagesPage() {
  const session = await auth()
  const userId = session!.user!.id!
  const [messages, agents] = await Promise.all([
    prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      include: { sender: { select: { codename: true, id: true } }, receiver: { select: { codename: true, id: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.user.findMany({ where: { id: { not: userId } }, select: { id: true, codename: true } }),
  ])
  // Mark received as read
  await prisma.message.updateMany({ where: { receiverId: userId, read: false }, data: { read: true } })
  return <MessagesClient messages={JSON.parse(JSON.stringify(messages))} agents={agents} userId={userId} />
}

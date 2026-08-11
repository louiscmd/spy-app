import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { receiverId, content, selfDestruct } = await req.json()
  const message = await prisma.message.create({
    data: { senderId: session.user.id, receiverId, content, selfDestruct: Boolean(selfDestruct) },
    include: { sender: { select: { id: true, codename: true } }, receiver: { select: { id: true, codename: true } } },
  })
  return NextResponse.json(message)
}

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { content } = await req.json()
  const log = await prisma.missionLog.create({
    data: { content, missionId: id, agentId: session.user.id },
  })
  return NextResponse.json(log)
}

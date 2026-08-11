import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { title, description, priority, location, deadline } = await req.json()
  const mission = await prisma.mission.create({
    data: {
      title, description: description || null, priority, location: location || null,
      deadline: deadline ? new Date(deadline) : null,
      agentId: session.user.id,
    },
    include: { logs: true },
  })
  return NextResponse.json(mission)
}

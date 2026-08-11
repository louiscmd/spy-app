import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await req.json()
  return NextResponse.json(await prisma.dossier.create({ data: { title: data.title, content: data.content, classification: data.classification, tags: data.tags || null, agentId: session.user.id } }))
}

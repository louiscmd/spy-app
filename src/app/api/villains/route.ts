import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await req.json()
  const villain = await prisma.villain.create({
    data: { name: data.name, alias: data.alias || null, organization: data.organization || null, threatLevel: data.threatLevel, status: data.status, specialty: data.specialty || null, lastLocation: data.lastLocation || null, bio: data.bio || null }
  })
  return NextResponse.json(villain)
}

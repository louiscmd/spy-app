import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await req.json()
  const target = await prisma.target.create({ data: { name: data.name, alias: data.alias || null, threatLevel: data.threatLevel, status: data.status, nationality: data.nationality || null, lastLocation: data.lastLocation || null, notes: data.notes || null } })
  return NextResponse.json(target)
}

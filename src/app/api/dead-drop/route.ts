import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { content, passphrase } = await req.json()
  const hashed = await bcrypt.hash(passphrase, 10)
  const drop = await prisma.deadDrop.create({
    data: { content, passphrase: hashed, creatorId: session.user.id },
  })
  return NextResponse.json({ id: drop.id })
}

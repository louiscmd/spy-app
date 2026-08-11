import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { passphrase } = await req.json()
  const drop = await prisma.deadDrop.findUnique({ where: { id } })
  if (!drop || drop.viewed) return NextResponse.json({ error: "Not found or already viewed" }, { status: 404 })
  const valid = await bcrypt.compare(passphrase, drop.passphrase)
  if (!valid) return NextResponse.json({ error: "Invalid passphrase" }, { status: 403 })
  await prisma.deadDrop.update({ where: { id }, data: { viewed: true } })
  return NextResponse.json({ content: drop.content })
}

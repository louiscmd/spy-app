import { prisma } from "@/lib/prisma"
import TargetClient from "./TargetClient"

export default async function TargetsPage() {
  const targets = await prisma.target.findMany({ orderBy: { createdAt: "desc" } })
  return <TargetClient targets={JSON.parse(JSON.stringify(targets))} />
}

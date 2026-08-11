import { prisma } from "@/lib/prisma"
import VillainClient from "./VillainClient"

export default async function VillainsPage() {
  const villains = await prisma.villain.findMany({ orderBy: { createdAt: "desc" } })
  return <VillainClient villains={JSON.parse(JSON.stringify(villains))} />
}

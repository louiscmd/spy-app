import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import MissionClient from "./MissionClient"

export default async function MissionsPage() {
  const session = await auth()
  const userId = session!.user!.id!
  const missions = await prisma.mission.findMany({
    where: { agentId: userId },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 3 } },
    orderBy: { createdAt: "desc" },
  })
  return <MissionClient missions={JSON.parse(JSON.stringify(missions))} userId={userId} />
}

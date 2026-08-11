import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import GadgetClient from "./GadgetClient"

export default async function GadgetsPage() {
  const session = await auth()
  const gadgets = await prisma.gadget.findMany({ where: { agentId: session!.user!.id! }, orderBy: { createdAt: "desc" } })
  return <GadgetClient gadgets={JSON.parse(JSON.stringify(gadgets))} />
}

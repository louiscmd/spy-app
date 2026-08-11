import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import DossierClient from "./DossierClient"

export default async function DossiersPage() {
  const session = await auth()
  const dossiers = await prisma.dossier.findMany({ where: { agentId: session!.user!.id! }, orderBy: { updatedAt: "desc" } })
  return <DossierClient dossiers={JSON.parse(JSON.stringify(dossiers))} />
}

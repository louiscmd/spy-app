import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import MapClient from "./MapClient"

export default async function MapPage() {
  const session = await auth()
  const [missions, targets, villains] = await Promise.all([
    prisma.mission.findMany({ where: { agentId: session!.user!.id! }, select: { id: true, title: true, lat: true, lng: true, status: true, location: true } }),
    prisma.target.findMany({ select: { id: true, name: true, lat: true, lng: true, threatLevel: true, lastLocation: true } }),
    prisma.villain.findMany({ select: { id: true, name: true, lat: true, lng: true, threatLevel: true, lastLocation: true } }),
  ])
  return <MapClient missions={JSON.parse(JSON.stringify(missions))} targets={JSON.parse(JSON.stringify(targets))} villains={JSON.parse(JSON.stringify(villains))} />
}

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Sidebar from "@/components/Sidebar"
import SessionProvider from "@/components/SessionProvider"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { codename: true },
  })

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-black">
        <Sidebar codename={user?.codename ?? "Unknown"} />
        <main className="md:ml-16 lg:ml-52 min-h-screen pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}

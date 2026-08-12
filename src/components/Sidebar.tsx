"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: "⬡" },
  { href: "/profile", label: "Profile", icon: "◈" },
  { href: "/status", label: "Status", icon: "★" },
  { href: "/missions", label: "Missions", icon: "◎" },
  { href: "/targets", label: "Targets", icon: "⊕" },
  { href: "/villains", label: "Suspects", icon: "☠" },
  { href: "/map", label: "Map", icon: "◉" },
  { href: "/messages", label: "Messages", icon: "▣" },
  { href: "/dead-drop", label: "Dead Drop", icon: "◆" },
  { href: "/cipher", label: "Cipher", icon: "⊞" },
  { href: "/gadgets", label: "Equipment", icon: "⚙" },
  { href: "/dossiers", label: "Dossiers", icon: "▤" },
  { href: "/radar", label: "BT Radar", icon: "◌" },
]

export default function Sidebar({ codename }: { codename: string }) {
  const path = usePathname()
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-16 lg:w-52 bg-[#050505] border-r border-[#1a1a1a] fixed top-0 left-0 h-screen z-40 transition-all duration-200">
        <div className="flex items-center gap-3 px-3 lg:px-4 py-5 border-b border-[#1a1a1a]">
          <div className="w-8 h-8 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-6 h-6">
              <polygon points="50,5 95,95 5,95" fill="white"/>
            </svg>
          </div>
          <div className="hidden lg:block overflow-hidden">
            <p className="text-[11px] text-gray-600 uppercase tracking-widest">Spy App</p>
            <p className="text-sm font-medium text-gray-200 truncate">{codename}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {nav.map(item => (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-md text-sm mb-0.5 transition-all duration-150",
                path === item.href
                  ? "bg-[#1a1a1a] text-gray-100"
                  : "text-gray-500 hover:text-gray-300 hover:bg-[#111]"
              )}>
              <span className="text-base w-5 text-center shrink-0 font-mono">{item.icon}</span>
              <span className="hidden lg:block tracking-wide">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="px-2 pb-4 border-t border-[#1a1a1a] pt-3">
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-md text-sm text-gray-600 hover:text-red-400 hover:bg-red-400/5 w-full transition-all">
            <span className="text-base w-5 text-center shrink-0">⊗</span>
            <span className="hidden lg:block">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#050505] border-t border-[#1a1a1a] flex overflow-x-auto">
        {nav.slice(0, 7).map(item => (
          <Link key={item.href} href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-2 min-w-[52px] text-[10px] transition-all",
              path === item.href ? "text-gray-200" : "text-gray-600"
            )}>
            <span className="text-lg font-mono">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}

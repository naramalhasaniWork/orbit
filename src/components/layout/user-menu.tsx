"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { User, Settings, Shield, LogOut, Bug } from "lucide-react";
import { useBugReport } from "@/components/bug-report/bug-report-provider";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const { data: session } = useSession();
  const { openBugReport } = useBugReport();
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={trigger}
          aria-label="Account menu"
          className="rounded-full ring-1 ring-border hover:ring-border transition-all focus:outline-none focus:ring-2 focus-visible:ring-ring"
        >
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt=""
              width={26}
              height={26}
              className="rounded-full"
            />
          ) : (
            <div className="h-[26px] w-[26px] rounded-full bg-foreground/[0.08] flex items-center justify-center">
              <span className="text-[10px] font-medium text-muted-foreground">
                {session?.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
              </span>
            </div>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground leading-none">
              {session?.user?.name ?? "User"}
            </p>
            <p className="text-xs text-muted-foreground leading-none">
              {session?.user?.email ?? ""}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link href="/dashboard/profile">
            <User className="h-4 w-4" />
            Profile Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link href="/dashboard/settings">
            <Settings className="h-4 w-4" />
            Workspace Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => openBugReport(trigger.current)}>
          <Bug className="h-4 w-4" />
          Report a bug
          <ShortcutKeys id="bug" className="ml-auto" />
        </DropdownMenuItem>
        {session?.userRole === "super_admin" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer gap-2">
              <Link href="/admin/dashboard">
                <Shield className="h-4 w-4" />
                Admin Dashboard
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-tm-fail focus:text-tm-fail focus:bg-tm-fail/10"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

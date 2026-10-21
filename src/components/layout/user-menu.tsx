"use client";

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
import { Avatar } from "@/components/ui/avatar";

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
          className="flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar name={session?.user?.name} email={session?.user?.email} image={session?.user?.image} size="md" decorative />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2.5">
            <Avatar name={session?.user?.name} email={session?.user?.email} image={session?.user?.image} size="md" decorative />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-sm font-medium text-foreground leading-none">
                {session?.user?.name ?? "User"}
              </p>
              <p className="truncate text-xs text-muted-foreground leading-none">
                {session?.user?.email ?? ""}
              </p>
            </div>
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

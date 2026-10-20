"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function AdminSignOut() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-xs text-muted-foreground hover:text-tm-fail gap-1.5"
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign Out
    </Button>
  );
}

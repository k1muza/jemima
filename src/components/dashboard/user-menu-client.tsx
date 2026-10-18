"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { useEffect } from "react";

import { signOut } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { clearSignedUrlCache } from "@/lib/backend/signed-url-cache";
import { useInventory } from "@/providers/inventory-store-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuClientProps = {
  user: { name: string; email: string; avatarUrl: string | null; isDemo: boolean };
};

export function UserMenuClient({ user }: UserMenuClientProps) {
  const setActor = useInventory((s) => s.setActor);
  // Stock movements are recorded under the signed-in person's name.
  useEffect(() => setActor(user.name), [setActor, user.name]);

  const identity = (
    <>
      <Avatar className="size-8 rounded-lg">
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
        <AvatarFallback className="rounded-lg bg-sidebar-accent text-sidebar-foreground">
          {user.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium text-sidebar-foreground">{user.name}</span>
        <span className="truncate text-xs text-dim">{user.email}</span>
      </span>
    </>
  );

  if (user.isDemo) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2" title="Sign-in is turned off for this deployment.">
        {identity}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-sidebar-accent">
        {identity}
        <ChevronsUpDown className="size-4 text-dim" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => {
            clearSignedUrlCache();
            signOut();
          }}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

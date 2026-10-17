import { getCurrentUser } from "@/lib/auth";

import { UserMenuClient } from "./user-menu-client";

/** Reads the session — render inside <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  return (
    <UserMenuClient
      user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl, isDemo: user.isDemo }}
    />
  );
}

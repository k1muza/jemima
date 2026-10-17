import Link from "next/link";
import { Suspense, type CSSProperties } from "react";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { InventoryStoreProvider } from "@/providers/inventory-store-provider";
import { PhotoUploadProvider } from "@/providers/photo-upload-provider";

// The shell is static and prerenders; only the session-dependent user menu
// streams in behind Suspense. proxy.ts guards access.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <InventoryStoreProvider>
      <PhotoUploadProvider>
        <SidebarProvider style={{ "--sidebar-width": "232px" } as CSSProperties}>
          <AppSidebar
            footer={
              <Suspense fallback={<Skeleton className="mx-2.5 h-10 bg-sidebar-accent" />}>
                <UserMenu />
              </Suspense>
            }
          />
          <SidebarInset className="min-w-0 bg-background">
            {/* Mobile-only bar; the sidebar is a sheet below md. */}
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-primary px-4 text-sidebar-foreground md:hidden">
              <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" />
              <Link href="/dashboard" className="font-serif text-2xl italic text-sidebar-foreground hover:text-sidebar-foreground">
                Jemima&apos;s Designs
              </Link>
            </header>
            <main className="flex-1 px-4 pt-6 pb-20 md:px-12 md:pt-10">
              <div className="mx-auto flex max-w-[1240px] flex-col gap-8">{children}</div>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </PhotoUploadProvider>
    </InventoryStoreProvider>
  );
}

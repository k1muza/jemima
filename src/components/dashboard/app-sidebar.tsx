"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/inventory/confirm-dialog";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { dashboardNav } from "@/config/nav";
import { cn } from "@/lib/utils";
import { useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";
import { usePhotoUpload } from "@/providers/photo-upload-provider";

/** `footer` is a slot so the server-rendered user menu can stream in behind Suspense. */
export function AppSidebar({ footer }: { footer: ReactNode }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const hydrated = useInventoryHydrated();
  const productCount = useInventory((s) => s.products.length);
  const threshold = useInventory((s) => s.threshold);
  const shopName = useInventory((s) => s.settings.shopName);
  const createProduct = useInventory((s) => s.createProduct);
  const resetDemo = useInventory((s) => s.resetDemo);
  const { pick } = usePhotoUpload();

  const close = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="offcanvas" className="border-none">
      <SidebarHeader className="px-6 pt-7 pb-0">
        <Link href="/dashboard" onClick={close} className="flex flex-col gap-1 text-sidebar-foreground hover:text-sidebar-foreground">
          <span className="font-serif text-[30px] leading-none tracking-[-0.01em] italic">
            {(hydrated && shopName.trim()) || "Jemima's Designs"}
          </span>
          <span className="font-mono text-[11px] tracking-[0.08em] text-dim uppercase">Stock room</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-[34px] px-4 pt-[34px]">
        {/* usePathname() is request data on dynamic routes, so it streams in behind Suspense. */}
        <Suspense fallback={<NavLinks pathname={null} count={hydrated ? productCount : null} onNavigate={close} />}>
          <ActiveNavLinks count={hydrated ? productCount : null} onNavigate={close} />
        </Suspense>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              close();
              router.push(`/dashboard/products/${createProduct()}`);
            }}
            className="flex justify-between rounded-lg bg-sidebar-foreground px-3.5 py-[11px] text-left text-sm font-semibold text-primary transition-colors hover:bg-white"
          >
            New product<span aria-hidden>+</span>
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              pick("new");
            }}
            className="rounded-lg border border-dashed border-[#4a433b] p-3.5 text-left text-[13px] leading-[1.45] text-[#c9c0b3] transition-colors hover:border-dim hover:text-sidebar-foreground"
          >
            Upload photos to start a product. Colours are detected for you.
          </button>
        </div>
      </SidebarContent>

      <SidebarFooter className="gap-4 px-4 pt-4 pb-[22px]">
        <div className="flex flex-col gap-2.5 px-2.5 text-xs leading-normal text-dim">
          <span>Low stock: {threshold} or fewer in a size. Changes save automatically.</span>
          <ConfirmDialog
            trigger={
              <button type="button" className="self-start text-left text-xs text-dim underline hover:text-sidebar-foreground">
                Reset demo data
              </button>
            }
            title="Reset to the demo catalogue?"
            description="Your changes and uploaded photos in this browser will be removed."
            confirmLabel="Reset"
            onConfirm={() => {
              resetDemo();
              close();
              router.push("/dashboard");
            }}
          />
        </div>
        {footer}
      </SidebarFooter>
    </Sidebar>
  );
}

type NavLinksProps = { count: number | null; onNavigate: () => void };

function ActiveNavLinks(props: NavLinksProps) {
  return <NavLinks pathname={usePathname()} {...props} />;
}

function NavLinks({ pathname, count, onNavigate }: NavLinksProps & { pathname: string | null }) {
  const isActive = (href: string) =>
    pathname !== null &&
    (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {dashboardNav.map((item) => {
        const on = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              on ? "bg-sidebar-accent text-sidebar-foreground" : "text-[#c9c0b3]",
            )}
          >
            <span>{item.title}</span>
            {item.showCount && count !== null && <span className="font-mono text-[11px] text-dim">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

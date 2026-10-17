"use client";

import type { ReactNode } from "react";

import { buttonStyles, Panel } from "@/components/inventory/primitives";
import { useInventory } from "@/providers/inventory-store-provider";

/** Shows load errors and the "waiting for access" state instead of page content. */
export function AccessGate({ children }: { children: ReactNode }) {
  const loadError = useInventory((s) => s.loadError);
  const pending = useInventory((s) => s.ready && s.access.role === "pending");
  const load = useInventory((s) => s.load);

  if (loadError) {
    return (
      <Panel className="flex flex-col items-start gap-3 p-7" >
        <h1 className="font-serif text-4xl">Couldn&apos;t load the stock room</h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {loadError}
        </p>
        <button type="button" onClick={() => load()} className={buttonStyles.primary}>
          Try again
        </button>
      </Panel>
    );
  }

  if (pending) {
    return (
      <Panel className="flex max-w-xl flex-col gap-3 p-7">
        <h1 className="font-serif text-4xl">Waiting for access</h1>
        <p className="text-sm leading-normal text-muted-foreground">
          Your account is set up, but the owner hasn&apos;t given you access to the stock room yet. Ask them to approve you
          under <span className="font-medium text-foreground">Settings → Staff &amp; permissions</span>, then reload this page.
        </p>
      </Panel>
    );
  }

  return children;
}

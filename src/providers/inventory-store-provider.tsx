"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

import { createSupabaseInventory } from "@/lib/backend/supabase-inventory";
import { photoDb } from "@/lib/inventory/photo-db";
import { createClient } from "@/lib/supabase/client";
import {
  createInventoryStore,
  type InventoryMode,
  type InventoryStore,
  type InventoryStoreApi,
} from "@/stores/inventory-store";

const InventoryStoreContext = createContext<InventoryStoreApi | null>(null);

/** Data older than this is refreshed when the tab regains focus (other staff may have made changes). */
const STALE_MS = 60_000;

export function InventoryStoreProvider({ mode, children }: { mode: InventoryMode; children: ReactNode }) {
  const [store] = useState(() =>
    createInventoryStore({
      mode,
      backend: mode === "supabase" ? createSupabaseInventory(createClient()) : undefined,
      onError: (message) => toast.error(message),
    }),
  );

  useEffect(() => {
    let loadedAt = 0;
    const load = async () => {
      await store.getState().load();
      loadedAt = Date.now();
    };

    Promise.resolve(store.persist.rehydrate()).then(() => {
      if (mode === "demo") {
        store.getState().ensureCatalogue(); // first visit: start with "All pieces"
        store.setState({ ready: true });
        photoDb.all().then((images) => store.getState().setImages(images));
      } else {
        load();
      }
    });
    if (mode === "demo") return;

    const onVisibility = () => {
      const state = store.getState();
      if (document.visibilityState === "hidden") {
        state.flushPending(); // save batched edits before the tab is backgrounded or closed
      } else if (Date.now() - loadedAt > STALE_MS && !state.hasPending()) {
        load();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!store.getState().hasPending()) return;
      store.getState().flushPending();
      e.preventDefault(); // browser asks "Leave site? Changes may not be saved"
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [store, mode]);

  return <InventoryStoreContext value={store}>{children}</InventoryStoreContext>;
}

function useInventoryStoreApi() {
  const store = use(InventoryStoreContext);
  if (!store) throw new Error("Inventory store hooks must be used within InventoryStoreProvider");
  return store;
}

/** Select a slice of inventory state, e.g. `useInventory((s) => s.products)`. */
export function useInventory<T>(selector: (store: InventoryStore) => T): T {
  return useStore(useInventoryStoreApi(), selector);
}

/** Imperative access for event handlers (reads latest state without subscribing). */
export function useInventoryApi() {
  return useInventoryStoreApi();
}

/** False until data has loaded (browser storage or Supabase). Render skeletons until then. */
export function useInventoryHydrated() {
  return useInventory((s) => s.ready && !s.loadError && s.access.role !== "pending");
}

/** What the signed-in person may see and change. */
export function useAccess() {
  return useInventory((s) => s.access);
}

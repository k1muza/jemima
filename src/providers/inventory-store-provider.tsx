"use client";

import { createContext, use, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useStore } from "zustand";

import { photoDb } from "@/lib/inventory/photo-db";
import { createInventoryStore, type InventoryStore, type InventoryStoreApi } from "@/stores/inventory-store";

const InventoryStoreContext = createContext<InventoryStoreApi | null>(null);

export function InventoryStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createInventoryStore);

  useEffect(() => {
    store.persist.rehydrate();
    photoDb.all().then((images) => store.getState().setImages(images));
  }, [store]);

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

/** False until saved data has loaded from browser storage. Render skeletons until then. */
export function useInventoryHydrated() {
  const store = useInventoryStoreApi();
  return useSyncExternalStore(
    (onChange) => store.persist.onFinishHydration(onChange),
    () => store.persist.hasHydrated(),
    () => false,
  );
}

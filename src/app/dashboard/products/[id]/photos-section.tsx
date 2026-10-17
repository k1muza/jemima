"use client";

import { toast } from "sonner";

import { PhotoFill, Swatch } from "@/components/inventory/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { nameColour } from "@/lib/inventory/colour";
import { plural } from "@/lib/inventory/format";
import type { Photo, Product } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useInventory } from "@/providers/inventory-store-provider";
import { usePhotoUpload } from "@/providers/photo-upload-provider";

export function PhotosSection({ product }: { product: Product }) {
  const { pick, dragging } = usePhotoUpload();
  const count = product.photos.length;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-[30px] font-normal">Photos</h2>
        <span className="text-xs text-subtle">
          {count ? `${plural(count, "photo")} · colours detected automatically` : "Colours are detected from each photo"}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
        {product.photos.map((photo, i) => (
          <PhotoTile key={photo.id} product={product} photo={photo} isCover={i === 0} />
        ))}
        <button
          type="button"
          onClick={() => pick(product.id)}
          className={cn(
            "flex aspect-4/5 flex-col items-center justify-center gap-1.5 rounded-[10px] border-2 border-dashed p-3 text-center text-[13px] leading-[1.4] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground",
            dragging ? "border-rose bg-rose-soft" : "border-strong-line",
          )}
        >
          <span className="font-serif text-[34px] leading-none">+</span>
          <span>{dragging ? "Drop to add" : count ? "Add photos" : "Drop photos here or click to upload"}</span>
        </button>
      </div>
    </section>
  );
}

function PhotoTile({ product, photo, isCover }: { product: Product; photo: Photo; isCover: boolean }) {
  const imageUrl = useInventory((s) => s.images[photo.id]);
  const { makeCover, removePhoto, assignPhoto, restoreProduct } = useInventory((s) => s);
  const variant = product.variants.find((v) => v.id === photo.variantId);
  const hex = variant?.colourHex ?? photo.hex;
  const variantLabel = (v: { colourName: string; style: string }) => v.colourName + (v.style ? ` · ${v.style}` : "");

  const remove = () => {
    const snapshot = product;
    removePhoto(product.id, photo.id);
    toast("Photo removed", { action: { label: "Undo", onClick: () => restoreProduct(snapshot) } });
  };

  const chip = "rounded-full bg-card/92 text-[11px] font-medium transition-colors hover:bg-white";

  return (
    <div className="relative flex min-w-0 flex-col gap-2">
      <PhotoFill hex={hex} imageUrl={imageUrl} label="sample photo" className="aspect-4/5 rounded-[10px]">
        {isCover && (
          <span className="absolute top-2 left-2 rounded-full bg-primary px-[9px] py-[3px] text-[11px] font-semibold text-primary-foreground">
            Cover
          </span>
        )}
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {!isCover && (
            <button type="button" onClick={() => makeCover(product.id, photo.id)} title="Make cover photo" className={cn(chip, "h-[26px] px-[9px]")}>
              Cover
            </button>
          )}
          <button type="button" onClick={remove} title="Remove photo" aria-label="Remove photo" className={cn(chip, "size-[26px] text-[15px] leading-none")}>
            ×
          </button>
        </div>
      </PhotoFill>

      <DropdownMenu>
        <DropdownMenuTrigger
          title="Detected colour. Click to change which colour row this photo belongs to."
          className="flex min-w-0 items-center gap-[7px] rounded-full border bg-card py-[5px] pr-2.5 pl-1.5 text-xs transition-colors hover:border-foreground"
        >
          <Swatch hex={hex} />
          <span className="truncate font-medium">{variant ? variantLabel(variant) : "Unassigned"}</span>
          <span className="ml-auto text-[10px] text-subtle">▾</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Belongs to</DropdownMenuLabel>
            {product.variants.map((v) => (
              <DropdownMenuItem
                key={v.id}
                onClick={() => assignPhoto(product.id, photo.id, v.id)}
                className={cn(v.id === photo.variantId && "bg-accent")}
              >
                <Swatch hex={v.colourHex} className="size-3" />
                {variantLabel(v)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => assignPhoto(product.id, photo.id, "own")}>
              <Swatch hex={photo.hex} className="size-3" />
              Its own colour ({nameColour(photo.hex)})
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

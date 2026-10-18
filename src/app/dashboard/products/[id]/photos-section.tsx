"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Check, ChevronLeft, ChevronRight, LoaderCircle, RotateCw, Scissors, Shirt, SquarePen, Undo2, WandSparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ColourPicker } from "@/components/inventory/colour-picker";
import { PhotoFill, Swatch } from "@/components/inventory/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { nameColour, rotatePhoto } from "@/lib/inventory/colour";
import { cutoutKey, enhancedKey, ironedKey, maskKey, photoSrc, refinedKey, type PhotoVersion } from "@/lib/inventory/cutout";
import { plural } from "@/lib/inventory/format";
import { thumbSrc } from "@/lib/inventory/thumbnail";
import type { Photo, Product } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useInventory } from "@/providers/inventory-store-provider";
import { usePhotoUpload } from "@/providers/photo-upload-provider";

import { RefineEditor } from "./refine-editor";

export function PhotosSection({ product }: { product: Product }) {
  const { pick, dragging } = usePhotoUpload();
  const count = product.photos.length;
  const [zoomedId, setZoomedId] = useState<string | null>(null);

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
          <PhotoTile key={photo.id} product={product} photo={photo} isCover={i === 0} onZoom={() => setZoomedId(photo.id)} />
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
      <PhotoLightbox product={product} photoId={zoomedId} onChange={setZoomedId} />
    </section>
  );
}

function PhotoLightbox({
  product,
  photoId,
  onChange,
}: {
  product: Product;
  photoId: string | null;
  onChange: (id: string | null) => void;
}) {
  const images = useInventory((s) => s.images);
  const photos = product.photos.filter((p) => images[p.id]);
  const index = photos.findIndex((p) => p.id === photoId);
  const imageUrl = index >= 0 ? photoSrc(images, photos[index]) : undefined;
  const step = (delta: number) => {
    if (photos.length < 2 || index < 0) return;
    onChange(photos[(index + delta + photos.length) % photos.length].id);
  };

  const control = "flex items-center justify-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/25";
  const nav = cn(control, "absolute top-1/2 size-11 -translate-y-1/2");

  return (
    <Dialog.Root open={!!imageUrl} onOpenChange={(open) => !open && onChange(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/85 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none sm:p-14"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") step(-1);
            if (e.key === "ArrowRight") step(1);
          }}
        >
          <Dialog.Title className="sr-only">
            {product.name}, photo {index + 1} of {photos.length}
          </Dialog.Title>
          {/* Clicking the empty space around the photo closes the lightbox. */}
          <Dialog.Close aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-zoom-out" />
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local object/data URL from the store
            <img src={imageUrl} alt="" className="relative max-h-full max-w-full rounded-md object-contain shadow-2xl" />
          )}
          <Dialog.Close aria-label="Close" className={cn(control, "absolute top-3 right-3 size-10")}>
            <X className="size-5" />
          </Dialog.Close>
          {photos.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className={cn(nav, "left-3")}>
                <ChevronLeft className="size-6" />
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Next photo" className={cn(nav, "right-3")}>
                <ChevronRight className="size-6" />
              </button>
              <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                {index + 1} / {photos.length}
              </span>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PhotoTile({
  product,
  photo,
  isCover,
  onZoom,
}: {
  product: Product;
  photo: Photo;
  isCover: boolean;
  onZoom: () => void;
}) {
  const original = useInventory((s) => s.images[photo.id]);
  const cutout = useInventory((s) => s.images[cutoutKey(photo.id)]);
  const refined = useInventory((s) => s.images[refinedKey(photo.id)]);
  const ironed = useInventory((s) => s.images[ironedKey(photo.id)]);
  const mask = useInventory((s) => s.images[maskKey(photo.id)]);
  const enhanced = {
    original: useInventory((s) => s.images[enhancedKey(photo.id, "original")]),
    cutout: useInventory((s) => s.images[enhancedKey(photo.id, "cutout")]),
    refined: useInventory((s) => s.images[enhancedKey(photo.id, "refined")]),
  };
  const removingBackground = useInventory((s) => !!s.cutoutPending[photo.id]);
  const enhancing = useInventory((s) => !!s.enhancePending[photo.id]);
  const ironing = useInventory((s) => !!s.ironPending[photo.id]);
  const thumbs = useInventory((s) => s.thumbs);
  const images = useInventory((s) => s.images);
  const {
    makeCover,
    removePhoto,
    assignPhoto,
    restoreProduct,
    replacePhotoImage,
    removeBackground,
    restoreOriginal,
    enhance,
    setEnhanced,
    ironClothes,
    acceptIroned,
    setIroned,
    updateVariant,
  } = useInventory((s) => s);
  const [rotating, setRotating] = useState(false);
  const [refining, setRefining] = useState(false);
  /** An enhance (true) or undo (false) not yet saved; null when nothing is pending. */
  const [draft, setDraft] = useState<boolean | null>(null);
  const [ironDraft, setIronDraft] = useState<string | null>(null);
  const [savingIroned, setSavingIroned] = useState(false);
  const showingCutout = !!(photo.showCutout && cutout);
  const version: PhotoVersion = showingCutout ? (photo.refined && refined ? "refined" : "cutout") : "original";
  const showingEnhanced = !!((draft ?? photo.enhanced) && enhanced[version]);
  const showingIroned = !!(photo.showIroned && ironed);
  const imageUrl = ironDraft || (showingIroned ? ironed : showingEnhanced ? enhanced[version] : showingCutout ? (photo.refined && refined) || cutout : original);
  const variant = product.variants.find((v) => v.id === photo.variantId);
  const hex = variant?.colourHex ?? photo.hex;
  const variantLabel = (v: { colourName: string; style: string }) => v.colourName + (v.style ? ` · ${v.style}` : "");

  const remove = () => {
    const snapshot = product;
    removePhoto(product.id, photo.id);
    toast("Photo removed", { action: { label: "Undo", onClick: () => restoreProduct(snapshot) } });
  };

  const rotate = async () => {
    if (!original || rotating) return;
    setRotating(true);
    try {
      // Turn every version, so the background-removed copy never needs processing again.
      const png = (url: string | undefined, keep: boolean | undefined) => (keep && url ? rotatePhoto(url, "image/png") : undefined);
      const [rotated, rotatedCutout, rotatedRefined, rotatedMask, enhancedOriginal, enhancedCutout, enhancedRefined] = await Promise.all([
        rotatePhoto(original),
        png(cutout, photo.hasCutout),
        png(refined, photo.refined && !!mask),
        png(mask, photo.refined && !!refined),
        enhanced.original && rotatePhoto(enhanced.original),
        png(enhanced.cutout, photo.hasCutout),
        png(enhanced.refined, photo.refined && !!mask && !!refined),
      ]);
      replacePhotoImage(product.id, photo.id, rotated, {
        cutout: rotatedCutout,
        refined: rotatedRefined,
        mask: rotatedMask,
        enhanced: { original: enhancedOriginal, cutout: enhancedCutout, refined: enhancedRefined },
      });
    } catch {
      toast.error("Couldn't rotate that photo.");
    } finally {
      setRotating(false);
    }
  };

  const dropBackground = async () => {
    const result = await removeBackground(product.id, photo.id);
    if (!result.ok) toast.error(result.error, { action: { label: "Retry", onClick: dropBackground } });
  };

  // Enhance and Undo preview instantly (the enhanced copy is processed once, then reused); Save keeps the choice.
  const choose = (on: boolean) => setDraft(on === !!photo.enhanced ? null : on);
  const toggleEnhance = async () => {
    if (showingEnhanced) return choose(false);
    const result = await enhance(product.id, photo.id);
    if (result.ok) choose(true);
    else toast.error(result.error, { action: { label: "Retry", onClick: toggleEnhance } });
  };
  const saveEnhanced = () => {
    if (draft !== null) setEnhanced(product.id, photo.id, draft);
    setDraft(null);
  };

  const toggleIron = async () => {
    if (showingIroned) return setIroned(product.id, photo.id, false);
    if (photo.hasIroned) return setIroned(product.id, photo.id, true);
    const result = await ironClothes(product.id, photo.id);
    if (result.ok) setIronDraft(result.image);
    else toast.error(result.error, { action: { label: "Retry", onClick: toggleIron } });
  };
  const saveIroned = async () => {
    if (!ironDraft || savingIroned) return;
    setSavingIroned(true);
    const result = await acceptIroned(product.id, photo.id, ironDraft);
    setSavingIroned(false);
    if (result.ok) setIronDraft(null);
    else toast.error(result.error);
  };

  const chip = "rounded-full bg-card/92 text-[11px] font-medium transition-colors hover:bg-white";
  const iconChip = cn(chip, "flex size-[26px] items-center justify-center disabled:opacity-60");

  return (
    <div className="relative flex min-w-0 flex-col gap-2">
      <PhotoFill hex={hex} imageUrl={thumbSrc(thumbs, imageUrl)} label="sample photo" className="aspect-4/5 rounded-[10px]">
        {imageUrl && (
          <button type="button" onClick={onZoom} aria-label="View larger" title="View larger" className="absolute inset-0 cursor-zoom-in" />
        )}
        {isCover && (
          <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-primary px-[9px] py-[3px] text-[11px] font-semibold text-primary-foreground">
            Cover
          </span>
        )}
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {!isCover && (
            <button type="button" onClick={() => makeCover(product.id, photo.id)} title="Make cover photo" className={cn(chip, "h-[26px] px-[9px]")}>
              Cover
            </button>
          )}
          {imageUrl && (
            <button
              type="button"
              onClick={rotate}
              disabled={rotating || removingBackground || enhancing || ironing || savingIroned || draft !== null || ironDraft !== null || showingIroned}
              title="Rotate photo"
              aria-label="Rotate photo"
              className={iconChip}
            >
              <RotateCw className={cn("size-3.5", rotating && "animate-spin")} />
            </button>
          )}
          <button type="button" onClick={remove} title="Remove photo" aria-label="Remove photo" className={cn(chip, "size-[26px] text-[15px] leading-none")}>
            ×
          </button>
        </div>
        {original && (
          <div className="absolute right-1.5 bottom-1.5 flex gap-1">
            <button
              type="button"
              onClick={toggleIron}
              disabled={ironing || savingIroned || rotating || removingBackground || enhancing || draft !== null || ironDraft !== null}
              aria-busy={ironing || savingIroned}
              aria-pressed={showingIroned}
              title={ironing ? "Ironing clothes…" : savingIroned ? "Saving…" : showingIroned ? "Restore Previous" : photo.hasIroned ? "Show Ironed Version" : "Iron Clothes"}
              aria-label={showingIroned ? "Restore Previous" : photo.hasIroned ? "Show Ironed Version" : "Iron Clothes"}
              className={cn(iconChip, showingIroned && "bg-primary text-primary-foreground hover:bg-primary/85")}
            >
              {ironing || savingIroned ? <LoaderCircle className="size-3.5 animate-spin" /> : showingIroned ? <Undo2 className="size-3.5" /> : <Shirt className="size-3.5" />}
            </button>
            {ironDraft ? (
              <>
                <button type="button" onClick={() => setIronDraft(null)} disabled={savingIroned} title="Cancel" aria-label="Cancel ironed preview" className={iconChip}>
                  <X className="size-3.5" />
                </button>
                <button type="button" onClick={saveIroned} disabled={savingIroned} title="Accept" aria-label="Accept ironed preview" className={iconChip}>
                  <Check className="size-3.5" />
                </button>
              </>
            ) : !showingIroned ? (
              <>
                <button
                  type="button"
                  onClick={toggleEnhance}
                  disabled={removingBackground || enhancing || rotating}
                  aria-busy={enhancing}
                  aria-pressed={showingEnhanced}
                  title={enhancing ? "Enhancing…" : showingEnhanced ? "Undo Enhance" : "Enhance Image"}
                  aria-label={showingEnhanced ? "Undo Enhance" : "Enhance Image"}
                  className={cn(iconChip, showingEnhanced && "bg-primary text-primary-foreground hover:bg-primary/85")}
                >
                  {enhancing ? <LoaderCircle className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}
                </button>
                {draft !== null ? (
                  <>
                    <button type="button" onClick={() => setDraft(null)} title="Cancel" aria-label="Cancel" className={iconChip}>
                      <X className="size-3.5" />
                    </button>
                    <button type="button" onClick={saveEnhanced} title="Save" aria-label="Save" className={iconChip}>
                      <Check className="size-3.5" />
                    </button>
                  </>
                ) : showingCutout ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setRefining(true)}
                      disabled={rotating || enhancing}
                      title="Refine Image"
                      aria-label="Refine Image"
                      className={iconChip}
                    >
                      <SquarePen className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => restoreOriginal(product.id, photo.id)}
                      disabled={enhancing}
                      title="Restore Original"
                      aria-label="Restore Original"
                      className={iconChip}
                    >
                      <Undo2 className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={dropBackground}
                    disabled={removingBackground || enhancing || rotating}
                    aria-busy={removingBackground}
                    title={removingBackground ? "Removing background…" : "Remove Background"}
                    aria-label="Remove Background"
                    className={iconChip}
                  >
                    {removingBackground ? <LoaderCircle className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
                  </button>
                )}
              </>
            ) : null}
          </div>
        )}
      </PhotoFill>
      {refining && <RefineEditor productId={product.id} photo={photo} onClose={() => setRefining(false)} />}

      <div className="flex min-w-0 items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Detected colour. Click to change which colour row this photo belongs to."
            className="flex min-w-0 flex-1 items-center gap-[7px] rounded-full border bg-card py-[5px] pr-2.5 pl-1.5 text-xs transition-colors hover:border-foreground"
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
              {(!variant || product.photos.some((ph) => ph.id !== photo.id && ph.variantId === photo.variantId)) && (
                <DropdownMenuItem onClick={() => assignPhoto(product.id, photo.id, "own")}>
                  <Swatch hex={photo.hex} className="size-3" />
                  Its own colour ({nameColour(photo.hex)})
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {variant && (
          <ColourPicker
            trigger="pipette"
            hex={variant.colourHex}
            label={variantLabel(variant)}
            // This photo first, then the row's other photos.
            photos={[photo, ...product.photos.filter((ph) => ph.id !== photo.id && ph.variantId === variant.id)].flatMap((ph) => {
              const url = thumbSrc(thumbs, ph.id === photo.id ? imageUrl : photoSrc(images, ph));
              return url ? [url] : [];
            })}
            onChange={(colourHex) => updateVariant(product.id, variant.id, { colourHex, colourName: nameColour(colourHex) })}
          />
        )}
      </div>
    </div>
  );
}

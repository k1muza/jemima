"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/inventory/confirm-dialog";
import { buttonStyles, PageHeader, Panel } from "@/components/inventory/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { csvDate, csvMoney, downloadCsv } from "@/lib/inventory/csv";
import { productUnits } from "@/lib/inventory/stock";
import { CATEGORIES, type Category } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useAccess, useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

const inputClass =
  "h-10 rounded-[9px] border bg-card px-3 text-sm focus:border-foreground focus:outline-none disabled:bg-secondary disabled:text-muted-foreground";

export function SettingsForm() {
  const hydrated = useInventoryHydrated();
  if (!hydrated) return <SettingsSkeleton />;
  return <SettingsContent />;
}

function SettingsContent() {
  const router = useRouter();
  const settings = useInventory((s) => s.settings);
  const threshold = useInventory((s) => s.threshold);
  const products = useInventory((s) => s.products);
  const { updateSettings, setThreshold, resetDemo } = useInventory((s) => s);
  const isDemo = useInventory((s) => s.mode === "demo");
  const access = useAccess();
  const isOwner = access.role === "owner";

  const setList = (key: "sizeTemplates" | "productTypes", category: Category, list: string[]) =>
    updateSettings({ [key]: { ...settings[key], [category]: list } });

  const exportProducts = () =>
    downloadCsv(
      `products-${csvDate()}.csv`,
      [
        "Name",
        "Category",
        "Type",
        "SKU",
        "Colours",
        "Sizes",
        "Units",
        ...(access.canViewCosts ? ["Unit cost (USD)"] : []),
        "Unit price (USD)",
      ],
      products.map((p) => [
        p.name,
        p.category,
        p.type,
        p.sku,
        p.variants.map((v) => v.colourName + (v.style ? ` (${v.style})` : "")).join("; "),
        p.sizes.join(" "),
        productUnits(p),
        ...(access.canViewCosts ? [csvMoney(p.costCents)] : []),
        csvMoney(p.priceCents),
      ]),
    );

  return (
    <>
      <PageHeader eyebrow={isOwner ? "Saved automatically" : "View only"} title="Settings" />
      {!isOwner && (
        <div className="rounded-[10px] border bg-card px-4 py-3 text-[13px] text-muted-foreground">
          Only the owner can change settings.
        </div>
      )}

      {/* Disables every control inside for non-owners (the database rejects their changes anyway). */}
      <fieldset disabled={!isOwner} className="contents">
        <Section title="Store" description="Shown in the sidebar and on exports.">
          <Field label="Store name">
            <input
              value={settings.shopName}
              onChange={(e) => updateSettings({ shopName: e.target.value })}
              placeholder="Jemima's Designs"
              className={inputClass}
            />
          </Field>
          <Field label="Currency" hint="Fixed to US dollars for now.">
            <select disabled value="USD" className={inputClass}>
              <option value="USD">USD — US dollar</option>
            </select>
          </Field>
          <Field label="Logo" hint="Logo upload arrives with photo storage in Supabase." group>
            <button type="button" disabled className={cn(buttonStyles.outline, "self-start opacity-50")}>
              Upload logo
            </button>
          </Field>
        </Section>

        <Section title="Stock alerts" description="When a size counts as low stock across the dashboard, products and inventory.">
          <Field label="Low-stock threshold" hint={`A size with 1–${threshold} units is low; 0 is sold out.`}>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={99}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className={cn(inputClass, "w-24 text-center font-mono")}
              />
              <span className="text-sm text-muted-foreground">units per size</span>
            </span>
          </Field>
          <Toggle
            label="Require a note for corrections and damage"
            hint="Staff must say why when they correct a count or write stock off."
            checked={settings.requireNoteForCorrections}
            onChange={(requireNoteForCorrections) => updateSettings({ requireNoteForCorrections })}
          />
        </Section>

        <Section
          title="Size templates"
          description="The sizes a new product starts with. Existing products keep their own sizes."
        >
          {CATEGORIES.map((category) => (
            <Field key={category} label={category} group>
              <ChipEditor
                items={settings.sizeTemplates[category]}
                onChange={(list) => setList("sizeTemplates", category, list)}
                normalise={(v) => v.toUpperCase()}
                placeholder="Add size"
                mono
                minItems={1}
              />
            </Field>
          ))}
        </Section>

        <Section title="Product types" description="Suggested when naming a product's type, e.g. Dresses or Heels.">
          {CATEGORIES.map((category) => (
            <Field key={category} label={category} group>
              <ChipEditor
                items={settings.productTypes[category]}
                onChange={(list) => setList("productTypes", category, list)}
                normalise={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                placeholder="Add type"
              />
            </Field>
          ))}
        </Section>

        <Section title="Photos & colour detection" description="How uploaded photos are handled.">
          <Toggle
            label="Detect colours from photos"
            hint="Off: new photos join the first colour row and you name colours yourself."
            checked={settings.autoDetectColours}
            onChange={(autoDetectColours) => updateSettings({ autoDetectColours })}
          />
          <Field label="Largest photo allowed" hint="Bigger files are skipped with a message.">
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={50}
                value={settings.maxPhotoMb}
                onChange={(e) => updateSettings({ maxPhotoMb: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
                className={cn(inputClass, "w-24 text-center font-mono")}
              />
              <span className="text-sm text-muted-foreground">MB</span>
            </span>
          </Field>
        </Section>
      </fieldset>

      {isOwner && <StaffSection isDemo={isDemo} />}

      <Section
        title="Data"
        description={
          isDemo
            ? "Demo mode: everything is stored in this browser only."
            : "Your catalogue is stored in Supabase and shared with your staff."
        }
      >
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportProducts} className={buttonStyles.outline}>
            Export products CSV
          </button>
          {isDemo && (
            <ConfirmDialog
              trigger={
                <button type="button" className={cn(buttonStyles.outline, "text-destructive hover:border-destructive")}>
                  Reset demo data
                </button>
              }
              title="Reset to the demo catalogue?"
              description="Products, photos, stock history and settings in this browser go back to the demo defaults."
              confirmLabel="Reset"
              onConfirm={() => {
                resetDemo();
                router.push("/dashboard");
              }}
            />
          )}
        </div>
      </Section>
    </>
  );
}

function StaffSection({ isDemo }: { isDemo: boolean }) {
  const staff = useInventory((s) => s.settings.staff);
  const { updateStaff, inviteStaff, removeStaff } = useInventory((s) => s);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <Section
      title="Staff & permissions"
      description="Owners see everything. Staff can edit the catalogue and adjust stock; cost and price access is per person."
    >
      {isDemo ? (
        <div className="rounded-[10px] border border-low-line bg-low-bg px-3.5 py-2.5 text-[13px] text-low-fg">
          Demo: permissions are saved in this browser only.
        </div>
      ) : (
        <p className="text-[13px] leading-normal text-muted-foreground">
          Invite someone by email; they get staff access when they sign up with that address. Anyone else who signs up waits here
          until you approve them.
        </p>
      )}
      <div className="overflow-x-auto rounded-[10px] border">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-subtle">
              <th className="px-3.5 py-2.5 font-normal">Person</th>
              <th className="py-2.5 pr-3 font-normal">Role</th>
              <th className="py-2.5 pr-3 font-normal">See costs</th>
              <th className="py-2.5 pr-3 font-normal">Edit prices</th>
              <th className="py-2.5 pr-3.5 font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((m) => {
              const owner = m.role === "Owner";
              const waiting = m.status === "pending";
              return (
                <tr key={m.id} className="border-t border-line-soft">
                  <td className="px-3.5 py-2.5">
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {m.name}
                        {m.status !== "active" && (
                          <span
                            className={cn(
                              "ml-2 rounded-full px-2 py-0.5 text-[11px] font-normal",
                              waiting ? "bg-low-bg text-low-fg" : "bg-secondary text-muted-foreground",
                            )}
                          >
                            {waiting ? "Waiting for approval" : "Invited"}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-subtle">{m.email}</span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    {owner ? (
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                        Owner
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Staff</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Switch
                      checked={owner || m.canViewCosts}
                      disabled={owner || waiting}
                      onCheckedChange={(canViewCosts) =>
                        updateStaff(m.id, { canViewCosts, canEditPrices: canViewCosts && m.canEditPrices })
                      }
                      aria-label={`${m.name} can see costs`}
                    />
                  </td>
                  <td className="py-2.5 pr-3">
                    <Switch
                      checked={owner || m.canEditPrices}
                      disabled={owner || waiting || !m.canViewCosts}
                      onCheckedChange={(canEditPrices) => updateStaff(m.id, { canEditPrices })}
                      aria-label={`${m.name} can edit prices`}
                    />
                  </td>
                  <td className="py-2.5 pr-3.5 text-right">
                    {waiting && (
                      <button
                        type="button"
                        onClick={() => {
                          updateStaff(m.id, { status: "active" });
                          toast(`${m.name} can now use the stock room`);
                        }}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[#3a332c]"
                      >
                        Approve
                      </button>
                    )}
                    {!owner && !waiting && (
                      <button
                        type="button"
                        onClick={() => {
                          removeStaff(m.id);
                          toast(`${m.name} removed`);
                        }}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
            toast.error("Enter a name and a valid email.");
            return;
          }
          inviteStaff(name, email);
          toast(`Invite saved for ${name.trim()}`);
          setName("");
          setEmail("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="New staff name"
          className={cn(inputClass, "flex-[1_1_160px]")}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="New staff email"
          className={cn(inputClass, "flex-[2_1_220px]")}
        />
        <button type="submit" className={buttonStyles.primary}>
          Invite
        </button>
      </form>
      <p className="text-xs text-subtle">Owner access can&apos;t be removed or limited.</p>
    </Section>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Panel className="grid gap-6 p-[22px] md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-10">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-serif text-[28px] leading-tight font-normal">{title}</h2>
        <p className="text-[13px] leading-normal text-muted-foreground">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </Panel>
  );
}

/** Labelled field. Use `group` when it holds several controls (a label may only wrap one). */
function Field({ label, hint, group, children }: { label: string; hint?: string; group?: boolean; children: ReactNode }) {
  const body = (
    <>
      {label}
      {children}
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </>
  );
  const className = "flex flex-col gap-1.5 text-xs text-muted-foreground";
  return group ? (
    <div role="group" aria-label={label} className={className}>
      {body}
    </div>
  ) : (
    <label className={className}>{body}</label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-subtle">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}

/** Ordered list of short labels, e.g. sizes. Enter or "Add" appends; × removes. */
function ChipEditor({
  items,
  onChange,
  normalise = (v) => v,
  placeholder,
  mono,
  minItems = 0,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  normalise?: (value: string) => string;
  placeholder: string;
  mono?: boolean;
  minItems?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = normalise(draft.trim());
    if (!value) return;
    if (items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      toast.error(`${value} is already in the list.`);
      return;
    }
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            "flex items-center gap-1 rounded-full border bg-card py-1 pr-1.5 pl-3 text-[13px] text-foreground",
            mono && "font-mono",
          )}
        >
          {item}
          <button
            type="button"
            onClick={() => onChange(items.filter((i) => i !== item))}
            disabled={items.length <= minItems}
            aria-label={`Remove ${item}`}
            className="px-0.5 text-[#c2b9ab] hover:text-destructive disabled:opacity-30"
          >
            ×
          </button>
        </span>
      ))}
      <span className="flex overflow-hidden rounded-full border bg-card">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn("h-8 w-24 bg-transparent px-3 text-[13px] text-foreground outline-none", mono && "font-mono")}
        />
        <button
          type="button"
          onClick={add}
          className="border-l bg-secondary px-3 text-[13px] font-medium text-foreground hover:bg-muted"
        >
          Add
        </button>
      </span>
    </span>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-14 w-64" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-48 rounded-[14px]" />
      ))}
    </>
  );
}

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="flex flex-col justify-between gap-10 bg-primary px-6 py-8 text-sidebar-foreground md:px-12 md:py-12">
        <div className="flex flex-col gap-1">
          <span className="font-serif text-[30px] leading-none tracking-[-0.01em] italic">Jemima&apos;s Designs</span>
          <span className="font-mono text-[11px] tracking-[0.08em] text-dim uppercase">Stock room</span>
        </div>
        <p className="hidden max-w-sm font-serif text-5xl leading-[1.05] tracking-[-0.02em] md:block">
          Every piece on the rail, every size in the back.
        </p>
        <p className="hidden text-xs text-dim md:block">For Jemima&apos;s Designs staff only.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

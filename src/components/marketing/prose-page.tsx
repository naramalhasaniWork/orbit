interface ProsePageProps {
  eyebrow: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}

/** Shared frame for the secondary public pages: mono eyebrow, one h1, a lead, then hairline sections. */
export function ProsePage({ eyebrow, title, lead, children }: ProsePageProps) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-20 pt-16 sm:px-8">
      <header className="grid grid-cols-1 gap-6 border-b border-border pb-10 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <span className="tm-label text-tm-t3">{eyebrow}</span>
          <h1 className="text-balance text-[clamp(36px,5vw,56px)] font-medium leading-[1] tracking-[-0.045em]">{title}</h1>
        </div>
        <p className="self-end text-pretty text-[18px] leading-relaxed text-tm-t2">{lead}</p>
      </header>
      {children}
    </div>
  );
}

export function ProseRow({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-3 border-b border-border py-8 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
      <span className="tm-label pt-1.5 text-tm-t3">{label}</span>
      <div className="max-w-[68ch] space-y-2">
        <h2 className="text-balance text-[22px] font-medium leading-tight tracking-display">{title}</h2>
        <div className="space-y-3 text-pretty text-[15px] leading-relaxed text-tm-t2">{children}</div>
      </div>
    </section>
  );
}

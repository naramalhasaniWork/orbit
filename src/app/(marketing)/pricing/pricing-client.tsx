import pricingContent from "@/app/(marketing)/content/pricing.json";
import { CREDIT_PACKAGES } from "@/lib/stripe/credit-packages";

/** Below the pricing band: the FAQ (copy in pricing.json) and credit top-up packs. Static; nothing animates. */
export function PricingPageClient() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
      <section aria-labelledby="faq" className="grid grid-cols-1 gap-6 py-16 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
        <h2 id="faq" className="tm-label pt-1.5 text-tm-t3">Questions</h2>
        <dl className="max-w-[68ch]">
          {pricingContent.faq.map((item) => (
            <div key={item.question} className="border-t border-border py-5 first:border-t-0 first:pt-0">
              <dt className="text-[16px] font-medium">{item.question}</dt>
              <dd className="mt-2 text-pretty text-[14px] leading-relaxed text-tm-t2">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="credits" className="grid grid-cols-1 gap-6 border-t border-border py-16 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
        <div>
          <h2 id="credits" className="tm-label pt-1.5 text-tm-t3">Credit top-ups</h2>
          <p className="mt-2 text-[13px] text-tm-t2">Buy more any time. Purchased credits never expire.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKAGES.map((pack) => (
            <div key={pack.id} className="flex flex-col gap-1 border-t border-foreground py-4 pr-6">
              <span className="tm-num text-[22px]">{pack.credits.toLocaleString("en-US")}</span>
              <span className="tm-label text-tm-t3">credits</span>
              <span className="tm-num mt-2 text-[15px]">${(pack.price / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>
              <span className="tm-label text-tm-t3">{(pack.price / pack.credits).toFixed(1)}¢ per credit</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

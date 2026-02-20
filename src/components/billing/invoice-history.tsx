"use client";

import { useEffect, useState } from "react";
import { FileText, Download, ExternalLink } from "lucide-react";

interface InvoiceRecord {
  id: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

interface InvoiceHistoryProps {
  workspaceId: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "text-green-400 bg-green-400/10" },
  open: { label: "Open", className: "text-amber-400 bg-amber-400/10" },
  draft: { label: "Draft", className: "text-muted-foreground bg-white/5" },
  void: { label: "Void", className: "text-muted-foreground bg-white/5" },
  uncollectible: { label: "Failed", className: "text-red-400 bg-red-400/10" },
};

export function InvoiceHistory({ workspaceId }: InvoiceHistoryProps) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInvoices() {
      try {
        const res = await fetch("/api/billing/invoices", {
          headers: { "x-workspace-id": workspaceId },
        });
        const json = await res.json();
        if (json.success) setInvoices(json.data.invoices);
      } finally {
        setLoading(false);
      }
    }
    fetchInvoices();
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-white/[0.02] animate-pulse" />
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No invoices yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h4 className="text-xs font-medium text-muted-foreground">Invoices</h4>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {invoices.map((invoice) => {
          const statusInfo = STATUS_LABELS[invoice.status] ?? STATUS_LABELS.draft;
          return (
            <div key={invoice.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground">
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusInfo.className}`}
                >
                  {statusInfo.label}
                </span>
                {invoice.pdfUrl && (
                  <a
                    href={invoice.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    title="Download PDF"
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatCurrency(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

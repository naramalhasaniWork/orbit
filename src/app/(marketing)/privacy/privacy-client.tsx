"use client";

import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

const EFFECTIVE_DATE = "February 24, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
        {children}
      </div>
    </div>
  );
}

export function PrivacyClient() {
  return (
    <div className="pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 mb-6">
            <Shield className="h-7 w-7 text-orbit-accent" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            How Orbit collects, uses, and protects your data. Written in plain
            language because privacy policies shouldn&apos;t require a law degree.
          </p>
          <p className="mt-2 text-sm text-muted-foreground/60">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </div>

        <div className="mt-12 space-y-10">
          <Section title="1. Who We Are">
            {/* [REVIEW WITH COUNSEL] Data controller: confirm Naram Alhasani, personally, as the operator/controller, and add a postal address if GDPR/UK GDPR applies. */}
            <p>
              Orbit is an AI-native testing platform operated by Naram Alhasani
              (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). We help development teams automatically
              test their applications by indexing source code, generating test
              plans with AI, and executing browser-based tests against staging
              environments.
            </p>
            <p>
              For privacy-related questions, contact us at{" "}
              <a href="mailto:naram@hey.com" className="text-orbit-accent hover:underline">
                naram@hey.com
              </a>.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <p className="font-medium text-foreground">Account data</p>
            <p>
              When you sign in with GitHub OAuth, we receive your GitHub profile
              information: name, email address, avatar URL, and GitHub user ID.
              We use this to create and manage your Orbit account.
            </p>

            <p className="font-medium text-foreground">Source code</p>
            <p>
              When you connect a repository, Orbit clones it to parse its
              structure. We perform AST (Abstract Syntax Tree) analysis to
              understand routes, components, authentication flows, and business
              logic. We generate vector embeddings from your code and store them
              in our PostgreSQL database for semantic retrieval during test
              planning. Your source code is used solely to provide the testing
              service and is never shared with other users or sold to third
              parties.
            </p>

            <p className="font-medium text-foreground">Browser test data</p>
            <p>
              During test execution, Orbit captures screenshots, video
              recordings, and DOM snapshots from your staging environment. These
              artifacts are stored in S3-compatible object storage and are
              accessible only to members of your workspace.
            </p>

            <p className="font-medium text-foreground">Secrets and credentials</p>
            <p>
              If you store environment variables or secrets in Orbit&apos;s vault
              (for example, staging URLs or API keys), they are encrypted at rest
              using AES-256-GCM. Secrets are never logged, never displayed in the
              UI (shown only as masked values), and are decrypted only at the
              moment of test execution.
            </p>

            <p className="font-medium text-foreground">Usage data</p>
            <p>
              We collect standard usage analytics: pages visited, features used,
              test run counts, and performance metrics. This helps us improve the
              product and debug issues.
            </p>
          </Section>

          <Section title="3. How We Use AI Providers">
            <p>
              Orbit sends portions of your code and application context to AI
              providers for analysis. We want to be fully transparent about this:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium text-foreground">Anthropic (Claude)</span>{" "}
                receives code snippets, system map data, and test context for
                test plan generation, failure analysis, and report writing.
              </li>
              <li>
                <span className="font-medium text-foreground">OpenAI</span>{" "}
                receives code snippets for embedding generation and specific
                analysis tasks where model routing determines it is the best fit.
              </li>
            </ul>
            <p>
              Both providers process data under their respective API terms, which
              prohibit using API inputs to train their models. We send only the
              minimum context necessary for each task and never send your full
              repository to any provider in a single request.
            </p>
          </Section>

          <Section title="4. How We Use Your Data">
            <p>We use the data we collect to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide, maintain, and improve the Orbit testing service</li>
              <li>Generate and execute test plans for your repositories</li>
              <li>Send you service notifications (run results, failures, account alerts)</li>
              <li>Monitor and prevent abuse or unauthorized access</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p>
              We do not sell your personal data or source code. We do not use
              your code to train AI models. We do not share your data with other
              Orbit users.
            </p>
          </Section>

          <Section title="5. Data Retention and Deletion">
            <p>
              <span className="font-medium text-foreground">Source code:</span>{" "}
              Cloned repository data is retained while your project is active.
              Embeddings and system maps persist to enable incremental re-indexing.
              When you delete a project, all associated code data, embeddings, and
              system maps are permanently deleted within 30 days.
            </p>
            <p>
              <span className="font-medium text-foreground">Test artifacts:</span>{" "}
              Screenshots, videos, and DOM snapshots are retained for 90 days
              after creation, then automatically purged. Enterprise customers can
              configure custom retention periods.
            </p>
            <p>
              <span className="font-medium text-foreground">Account data:</span>{" "}
              Retained while your account is active. When you delete your account,
              all personal data is removed within 30 days. Anonymized, aggregated
              usage statistics may be retained indefinitely.
            </p>
          </Section>

          <Section title="6. Third-Party Sub-Processors">
            <p>We use the following third-party services to operate Orbit:</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="text-left px-4 py-2 font-medium text-foreground">Provider</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    ["Anthropic", "AI analysis and test plan generation"],
                    ["OpenAI", "Embedding generation and AI analysis"],
                    ["Railway", "Application and database hosting"],
                    ["GitHub", "OAuth authentication and repository access"],
                    ["Browserbase", "Cloud browser infrastructure for test execution"],
                  ].map(([provider, purpose]) => (
                    <tr key={provider}>
                      <td className="px-4 py-2 font-medium text-foreground">{provider}</td>
                      <td className="px-4 py-2">{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="7. Your Rights">
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium text-foreground">Access</span> the personal data we hold about you</li>
              <li><span className="font-medium text-foreground">Correct</span> inaccurate personal data</li>
              <li><span className="font-medium text-foreground">Delete</span> your account and all associated data</li>
              <li><span className="font-medium text-foreground">Export</span> your data in a machine-readable format</li>
              <li><span className="font-medium text-foreground">Revoke</span> GitHub access at any time through your GitHub settings</li>
            </ul>
            <p>
              To exercise any of these rights, email{" "}
              <a href="mailto:naram@hey.com" className="text-orbit-accent hover:underline">
                naram@hey.com
              </a>.
              We will respond within 30 days.
            </p>
          </Section>

          <Section title="8. Cookies and Analytics">
            <p>
              Orbit uses essential cookies for authentication (session tokens)
              and preferences. We do not use third-party advertising cookies or
              cross-site tracking. We may use privacy-focused analytics to
              understand product usage in aggregate. You can disable non-essential
              cookies in your browser settings.
            </p>
          </Section>

          <Section title="9. Children&apos;s Privacy">
            <p>
              Orbit is not intended for use by anyone under the age of 16. We do
              not knowingly collect personal data from children. If you believe a
              child has provided us with personal data, please contact us and we
              will delete it promptly.
            </p>
          </Section>

          <Section title="10. International Data Transfers">
            <p>
              Orbit&apos;s infrastructure is hosted in the United States via Railway.
              If you access Orbit from outside the United States, your data will
              be transferred to and processed in the United States. By using
              Orbit, you consent to this transfer. We ensure all sub-processors
              maintain appropriate data protection measures.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this privacy policy from time to time. If we make
              material changes, we will notify you via email or a prominent
              notice in the product. Your continued use of Orbit after changes
              take effect constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              For questions, concerns, or requests related to this privacy
              policy, contact us at{" "}
              <a href="mailto:naram@hey.com" className="text-orbit-accent hover:underline">
                naram@hey.com
              </a>.
            </p>
          </Section>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-orbit-accent hover:text-orbit-accent/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

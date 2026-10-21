"use client";

import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

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

export function TermsClient() {
  return (
    <div className="pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 mb-6">
            <FileText className="h-7 w-7 text-orbit-accent" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            The agreement between you and Orbit. Please read these terms
            carefully before using the platform.
          </p>
          <p className="mt-2 text-sm text-muted-foreground/60">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </div>

        <div className="mt-12 space-y-10">
          <Section title="1. Service Description">
            <p>
              Orbit is an AI-native testing platform that indexes source code
              repositories, generates test plans using artificial intelligence,
              and executes browser-based tests against staging environments.
              The service includes code analysis, test plan generation, test
              execution, result reporting, and integrations with third-party
              tools (GitHub, Linear, Slack).
            </p>
          </Section>

          <Section title="2. Eligibility">
            <p>
              You must be at least 16 years old and have the legal capacity to
              enter into a binding agreement to use Orbit. If you are using Orbit
              on behalf of an organization, you represent that you have the
              authority to bind that organization to these terms.
            </p>
          </Section>

          <Section title="3. Account Responsibilities">
            <p>
              You are responsible for maintaining the security of your account
              credentials and GitHub OAuth connection. You are responsible for
              all activity that occurs under your account. Notify us immediately
              at{" "}
              <a href="mailto:[CONTACT EMAIL]" className="text-orbit-accent hover:underline">
                [CONTACT EMAIL]
              </a>{" "}
              if you suspect unauthorized access.
            </p>
            <p>
              You must provide accurate information when creating your account
              and keep it up to date. One person or entity may not maintain more
              than one free account.
            </p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree to use Orbit only for lawful purposes. You must not:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Run tests against environments you do not own or have explicit authorization to test</li>
              <li>Use Orbit to perform denial-of-service attacks, load testing, or stress testing against any target</li>
              <li>Attempt to access, disrupt, or damage other users&apos; data or workspaces</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Orbit platform</li>
              <li>Use Orbit to develop a competing product or service</li>
              <li>Circumvent usage limits, credit caps, or rate limiting mechanisms</li>
              <li>Upload malicious code, malware, or content that violates any law</li>
            </ul>
            <p>
              Violation of these terms may result in immediate account
              suspension or termination without refund.
            </p>
          </Section>

          <Section title="5. Intellectual Property">
            <p>
              <span className="font-medium text-foreground">Your code:</span>{" "}
              You retain all ownership and intellectual property rights in your
              source code, repositories, and application content. By connecting a
              repository, you grant Orbit a limited, non-exclusive license to
              access, clone, parse, and analyze your code solely for the purpose
              of providing the testing service.
            </p>
            <p>
              <span className="font-medium text-foreground">Orbit&apos;s platform:</span>{" "}
              Orbit retains all rights in the platform, including its software,
              algorithms, AI models, user interface, documentation, and
              branding. Nothing in these terms transfers ownership of any Orbit
              intellectual property to you.
            </p>
            <p>
              <span className="font-medium text-foreground">AI-generated outputs:</span>{" "}
              Test plans, analysis reports, and other outputs generated by
              Orbit&apos;s AI agents are provided for your use as part of the
              service. You may use these outputs freely in connection with your
              development workflow.
            </p>
          </Section>

          <Section title="6. AI-Generated Content Disclaimer">
            <p>
              Orbit uses artificial intelligence (including models from Anthropic
              and OpenAI) to generate test plans, analyze code, execute tests,
              and produce reports. AI-generated content may contain inaccuracies,
              false positives, or incomplete analysis. Orbit does not warrant
              that AI-generated test plans will catch all bugs, that failure
              analysis will be accurate in every case, or that the testing
              coverage will be exhaustive.
            </p>
            <p>
              You are responsible for reviewing AI-generated outputs and should
              not rely on Orbit as your sole quality assurance mechanism.
            </p>
          </Section>

          <Section title="7. Service Availability">
            <p>
              We strive to keep Orbit available and reliable, but we do not
              guarantee uninterrupted access. The service may be temporarily
              unavailable due to maintenance, updates, or circumstances beyond
              our control. We will make reasonable efforts to notify you of
              planned downtime.
            </p>
            <p>
              Formal service level agreements (SLAs) with uptime guarantees are
              available only for Enterprise plan customers under a separate
              agreement.
            </p>
          </Section>

          <Section title="8. Payment and Credits">
            <p>
              Orbit operates on a credit-based pricing model. Credits are
              consumed when you run tests, index repositories, or use AI
              features. Pricing tiers include:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium text-foreground">Free:</span> Limited credits per month, no credit card required</li>
              <li><span className="font-medium text-foreground">Pro ($79 per seat/month):</span> Monthly credits per seat, pooled across the workspace</li>
              <li><span className="font-medium text-foreground">Team ($149 per seat/month):</span> Team features with a larger per-seat credit allocation</li>
              <li><span className="font-medium text-foreground">Enterprise:</span> Custom pricing with dedicated support</li>
            </ul>
            <p>
              Paid plans are billed per seat, and each seat admits one workspace
              member (pending invitations count toward seats). Unused credits from
              a monthly allocation roll over for one month and expire when the
              following month&apos;s allocation is granted; rolled-over credits are
              used first. Additional credit packs may be purchased separately and
              do not expire. Paid subscriptions renew
              automatically unless cancelled before the next billing cycle.
              Refunds are not provided for partial months or unused credits.
            </p>
          </Section>

          <Section title="9. Data Handling">
            <p>
              Your use of Orbit is also governed by our{" "}
              <Link href="/privacy" className="text-orbit-accent hover:underline">
                Privacy Policy
              </Link>,
              which describes how we collect, use, and protect your data
              including source code, test artifacts, and personal information.
            </p>
          </Section>

          <Section title="10. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Orbit and its operators
              shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, including but not limited to
              loss of profits, data, business opportunities, or goodwill,
              arising from your use of or inability to use the service.
            </p>
            <p>
              Our total aggregate liability for all claims related to the
              service shall not exceed the amount you paid to Orbit in the
              twelve (12) months preceding the claim. If you are on the free
              plan, our total liability shall not exceed fifty US dollars ($50).
            </p>
            <p>
              Orbit is a testing tool, not a guarantee of software quality. We
              are not liable for bugs, security vulnerabilities, or defects in
              your software that Orbit fails to detect.
            </p>
          </Section>

          <Section title="11. Indemnification">
            <p>
              You agree to indemnify and hold harmless Orbit and its operators
              from any claims, damages, losses, or expenses (including reasonable
              legal fees) arising from: (a) your use of the service, (b) your
              violation of these terms, (c) your violation of any third-party
              rights, or (d) any content or code you provide to the service.
            </p>
          </Section>

          <Section title="12. Termination">
            <p>
              <span className="font-medium text-foreground">By you:</span>{" "}
              You may delete your account at any time through the Orbit
              dashboard or by contacting us. Upon deletion, your data will be
              removed in accordance with our Privacy Policy.
            </p>
            <p>
              <span className="font-medium text-foreground">By Orbit:</span>{" "}
              We may suspend or terminate your account if you violate these
              terms, engage in abusive behavior, or if we are required to do so
              by law. We will provide reasonable notice unless immediate action
              is necessary to protect the service or other users.
            </p>
            <p>
              Upon termination, your right to use the service ceases
              immediately. Sections that by their nature should survive
              termination (including limitation of liability, indemnification,
              and intellectual property) will continue to apply.
            </p>
          </Section>

          <Section title="13. Dispute Resolution">
            <p>
              Any dispute arising from these terms or your use of Orbit shall
              first be addressed through good-faith negotiation. If the dispute
              cannot be resolved within 30 days, either party may pursue
              resolution through binding arbitration or in the courts of
              applicable jurisdiction. These terms are governed by the laws of
              the United States.
            </p>
          </Section>

          <Section title="14. Modifications">
            <p>
              We may update these terms from time to time. If we make material
              changes, we will notify you via email or a prominent notice in the
              product at least 30 days before the changes take effect. Your
              continued use of Orbit after the effective date constitutes
              acceptance of the updated terms. If you do not agree with the
              changes, you may delete your account before they take effect.
            </p>
          </Section>

          <Section title="15. General Provisions">
            <p>
              <span className="font-medium text-foreground">Severability:</span>{" "}
              If any provision of these terms is found to be unenforceable, the
              remaining provisions will continue in full force and effect.
              {" "}<span className="font-medium text-foreground">Waiver:</span>{" "}
              Our failure to enforce any right or provision does not constitute
              a waiver of that right or provision.
            </p>
            <p>
              <span className="font-medium text-foreground">Entire agreement:</span>{" "}
              These terms, together with the Privacy Policy, constitute the
              entire agreement between you and Orbit regarding the service.
              {" "}<span className="font-medium text-foreground">Assignment:</span>{" "}
              You may not assign your rights under these terms without our prior
              written consent. We may assign our rights to a successor entity in
              connection with a merger, acquisition, or sale of assets.
            </p>
          </Section>

          <Section title="16. Contact">
            <p>
              For questions about these terms, contact us at{" "}
              <a href="mailto:[CONTACT EMAIL]" className="text-orbit-accent hover:underline">
                [CONTACT EMAIL]
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

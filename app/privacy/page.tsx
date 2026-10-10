import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · OakAttest",
  description:
    "How Yuma IT Pty Ltd handles personal information for OakAttest under the Privacy Act 1988 and the Australian Privacy Principles.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-950">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-sm leading-6 text-slate-800">
        <p>
          This Privacy Policy applies to all personal information collected by Yuma IT Pty
          Ltd, ABN 62 684 389 839 (<strong>we</strong>, <strong>us</strong> or{" "}
          <strong>our</strong>) through OakAttest. We are bound by the Privacy Act 1988
          (Cth) and the Australian Privacy Principles.
        </p>
        <p>
          This page is public. It does not cover personal information that customers collect
          or hold inside their own OakAttest deployments. Those customers are responsible
          for their own privacy notices.
        </p>

        <h2 className="pt-2 text-lg font-semibold text-slate-900">
          1. What information do we collect?
        </h2>
        <p>
          The kind of Personal Information that we collect from you will depend on how you
          use the product. The Personal Information which we collect and hold about you may
          include: name, email address, organisation, role, authentication identifiers,
          tenant and workspace records, engagement, assessment, evidence files and metadata,
          findings, assessor notes, export records, audit logs (user ID, tenant or workspace
          ID, action, resource, timestamp, IP address and user agent where available),
          Marketplace subscription identifiers and lifecycle state, and support
          correspondence.
        </p>

        <h2 className="pt-2 text-lg font-semibold text-slate-900">2. Types of information</h2>
        <p>
          The Privacy Act 1988 (Cth) defines Personal Information and Sensitive Information.
          Personal Information is information or an opinion about an identified individual
          or an individual who is reasonably identifiable, whether true or not, and whether
          recorded in a material form or not. Sensitive Information includes racial or
          ethnic origin, political opinions, religious or philosophical beliefs, membership
          of a trade union or other professional body, criminal record or health
          information. We do not ask you to provide Sensitive Information as a condition of
          using OakAttest. Evidence or notes that a customer or assessor uploads may already
          contain it.
        </p>

        <h2 className="pt-2 text-lg font-semibold text-slate-900">
          3. How we collect your Personal Information
        </h2>
        <p>
          We may collect Personal Information from you whenever you input it into OakAttest
          or provide it to us in any other way. We may collect cookies that keep you signed
          in. We generally collect Personal Information from you only, but sometimes a third
          party such as a tenant administrator or Microsoft Marketplace may give it to us.
        </p>

        <h2 className="pt-2 text-lg font-semibold text-slate-900">4. Purpose of collection</h2>
        <p>
          We collect Personal Information to operate OakAttest, provide support, secure the
          service, maintain auditability, produce exports you request, satisfy Marketplace
          subscription lifecycle requirements where a listing is used, and meet our legal,
          accounting and record-keeping obligations. Final subprocessors, regions, and
          support tooling must be listed before public submission. Expected categories
          include Azure hosting, email delivery, logging or monitoring, and support tooling.
          We will confirm the current list in writing on request. If you have asked us about
          OakAttest, we may contact you about that request and about closely related
          services. You can opt out by emailing hello@yumait.com.au.
        </p>

        <h2 className="pt-2 text-lg font-semibold text-slate-900">
          5. Security, Access and correction
        </h2>
        <p>
          We store your Personal Information in a way that reasonably protects it from
          unauthorised access, misuse, modification or disclosure. Those steps include
          tenant scoping, role-based access controls, audit logging, private evidence
          storage, encryption in transit, and controlled downloads. Retention follows the
          customer&apos;s tenant and assessment settings, support obligations, legal hold,
          and applicable law.
        </p>
        <p>
          You may ask for access to the Personal Information we hold about you, or ask us to
          correct or delete information we are not required to keep, by writing to
          hello@yumait.com.au. There is no charge. We will respond within 30 days.
        </p>
        <p>
          If an eligible data breach occurs (unauthorised access, disclosure or loss of
          personal information that is likely to result in serious harm), we will notify
          affected individuals and the Office of the Australian Information Commissioner as
          soon as practicable, as required by the Notifiable Data Breaches scheme. We do not
          notify every security incident.
        </p>

        <h2 className="pt-2 text-lg font-semibold text-slate-900">6. Complaint procedure</h2>
        <p>
          If you have a complaint concerning the manner in which we maintain the privacy of
          your Personal Information, please contact us at hello@yumait.com.au. We will
          acknowledge your complaint within five business days and give you a written
          response within 30 days. If you remain dissatisfied, you may refer the matter to
          the Office of the Australian Information Commissioner at{" "}
          <a className="underline" href="https://www.oaic.gov.au/privacy/privacy-complaints">
            https://www.oaic.gov.au/privacy/privacy-complaints
          </a>{" "}
          or by phone on 1300 363 992.
        </p>

        <h2 className="pt-2 text-lg font-semibold text-slate-900">7. Overseas transfer</h2>
        <p>
          OakAttest SaaS is intended to run in publisher-controlled Azure infrastructure.
          Final subprocessors and regions must be listed before public submission. We will
          confirm the current position in writing on request. We will not name a country
          here that we have not confirmed. Where Personal Information is handled outside
          Australia we take reasonable steps to ensure the recipient handles it consistently
          with the Australian Privacy Principles. We remain accountable for that disclosure.
        </p>

        <h2 className="pt-2 text-lg font-semibold text-slate-900">
          8. How to contact us about privacy
        </h2>
        <p>
          If you have any queries, or if you seek access to your Personal Information, or if
          you have a complaint about our privacy practices, you can contact us through:{" "}
          <a className="underline" href="mailto:hello@yumait.com.au">
            hello@yumait.com.au
          </a>
          .
        </p>
        <p>Last Updated: 20 August 2026</p>
        <p>
          <Link className="underline" href="/signin">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

import LegalPageLayout from '../components/LegalPageLayout';

interface TermsOfServiceProps {
  onBack: () => void;
}

const LAST_UPDATED = 'August 31, 2026';

export default function TermsOfService({ onBack }: TermsOfServiceProps) {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated={LAST_UPDATED} onBack={onBack}>
      <p>
        These Terms of Service ("Terms") govern your access to and use of Uruu OS, a business-management platform
        provided by Shadow Root Security Technologies ("Uruu OS," "we," "us," or "our") at{' '}
        <a href="https://uruu.enterprises">uruu.enterprises</a> (the "Service"). By creating a workspace or otherwise
        using the Service, you agree to these Terms. If you're accepting on behalf of a business, you confirm you
        have the authority to bind that business.
      </p>
      <p>
        <strong>This document is a good-faith description of our actual terms, not generic boilerplate — but it
        isn't legal advice.</strong> Have a licensed attorney review it before relying on it as your finished,
        enforceable customer contract, particularly around billing, liability, and any regulated activity (such as
        pharmacy dispensing) your business carries out using the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        Uruu OS provides point-of-sale, inventory, pharmacy dispensing, café/WiFi session, and printing-order
        management tools in a single workspace, isolated per business ("organization"). Each organization gets a
        7-day free trial with no credit card required.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide accurate information when creating an account and keep it up to date.</li>
        <li>You're responsible for keeping your login credentials confidential and for all activity under your account.</li>
        <li>An organization's admin is responsible for the staff accounts they create or invite into that workspace, and for removing access when appropriate.</li>
        <li>You must be old enough to lawfully enter into a contract in your jurisdiction to create an account.</li>
      </ul>

      <h2>3. Subscription, billing, and trial</h2>
      <ul>
        <li>Pricing is set per business type (Retail &amp; General, Café &amp; Printing, or Pharmacy) and billing cycle (monthly, quarterly, or yearly), shown on our pricing page in Zambian Kwacha (ZMW) unless otherwise agreed.</li>
        <li><strong>Billing is currently manual, not automated.</strong> We do not charge a card or collect payment credentials through the Service. You pay via the payment instructions we provide (for example, mobile money), and your platform admin records the payment against your account.</li>
        <li>If payment isn't recorded by the end of your trial or billing period's due date, your workspace is automatically locked (staff lose access to operational data) until a payment is recorded. This is not a penalty — it's how the Service keeps trial/billing state enforceable without a payment processor in the loop.</li>
        <li>We may change pricing going forward; we'll make a reasonable effort to notify you before a change affects your account.</li>
      </ul>

      <h2>4. Cancellation and deletion</h2>
      <ul>
        <li>You may stop using the Service and request that your workspace be closed at any time by contacting us.</li>
        <li>We may remove ("delete") a tenant workspace — locking access immediately and removing it from the platform admin's tenant list — for terms violations, non-payment, or at your request. This does not immediately or automatically erase your underlying records; see our Privacy Policy for how retention and full-erasure requests work.</li>
        <li>Because billing is manual, we don't process automated refunds. If you believe you were incorrectly billed, contact us — refunds and credits, if any, are handled case by case.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose, or to store data you don't have the right to store.</li>
        <li>Attempt to access another organization's workspace or data, or to probe, scan, or breach the Service's security.</li>
        <li>Interfere with or disrupt the Service, including through automated signups, scraping, or denial-of-service activity — this is part of why the signup form is protected against automated abuse.</li>
        <li>Resell, sublicense, or provide third-party access to the Service without our written agreement.</li>
        <li>Reverse-engineer or attempt to extract the Service's source code, except to the extent applicable law says this restriction can't be enforced.</li>
      </ul>

      <h2>6. Your content and regulated activity</h2>
      <p>
        You own the data you and your team put into your workspace. You grant us a limited license to host, store,
        and process it solely to provide the Service to you. You're responsible for the accuracy and lawfulness of
        that content.
      </p>
      <p>
        <strong>Uruu OS is record-keeping software — it is not a licensed pharmacy, medical provider, or payment
        processor, and does not practice medicine or pharmacy.</strong> If your business is a pharmacy or otherwise
        regulated, you remain solely responsible for complying with all applicable licensing, dispensing,
        controlled-substance, health-data, and other regulatory requirements in your jurisdiction — the Service is a
        tool you use to do that, not a substitute for that compliance.
      </p>

      <h2>7. Availability and changes</h2>
      <p>
        We aim to keep the Service reliable, but we don't guarantee uninterrupted or error-free operation. We may
        perform maintenance, and we may add, change, or remove features over time.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The Uruu OS name, branding, and underlying software belong to Shadow Root Security Technologies. These Terms
        don't grant you any ownership or license in the Service itself beyond the right to use it as intended.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may suspend or terminate your access if you violate these Terms, don't pay for the Service, or engage in
        fraudulent or abusive activity. You may stop using the Service, or request account closure, at any time. On
        termination, your right to use the Service ends; data retention is handled as described in our Privacy
        Policy.
      </p>

      <h2>10. Disclaimers and limitation of liability</h2>
      <p>
        The Service is provided "as is" and "as available," without warranties of any kind, to the maximum extent
        permitted by law. We are not liable for indirect, incidental, or consequential damages, or for your
        business's own regulatory compliance. To the extent permitted by law, our total liability for any claim
        related to the Service is limited to the amount you paid us in the three months before the claim arose.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify and hold us harmless from claims arising out of your use of the Service, your
        content, or your violation of these Terms or applicable law.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Republic of Zambia, without regard to conflict-of-law
        principles, unless otherwise required by the law of your jurisdiction.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms as the Service evolves. We'll update the "Last updated" date above, and for
        material changes we'll make a reasonable effort to notify account admins directly. Continued use of the
        Service after a change takes effect means you accept the updated Terms.
      </p>

      <h2>14. Contact us</h2>
      <p>
        Questions about these Terms? Email{' '}
        <a href="mailto:shadowrootsec@gmail.com">shadowrootsec@gmail.com</a>, or WhatsApp{' '}
        <a href="https://wa.me/260979501830" target="_blank" rel="noopener noreferrer">0979 501 830</a>.
      </p>
    </LegalPageLayout>
  );
}

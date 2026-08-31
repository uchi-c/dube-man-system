import LegalPageLayout from '../components/LegalPageLayout';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const LAST_UPDATED = 'August 31, 2026';

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={LAST_UPDATED} onBack={onBack}>
      <p>
        This Privacy Policy explains how Shadow Root Security Technologies ("Uruu OS," "we," "us," or "our")
        collects, uses, stores, and protects information in connection with the Uruu OS platform available at{' '}
        <a href="https://uruu.enterprises">uruu.enterprises</a> (the "Service"). By creating a workspace or otherwise
        using the Service, you agree to the practices described here.
      </p>
      <p>
        <strong>This policy is a good-faith description of how the Service actually works, written to be accurate
        rather than generic — but it is not legal advice.</strong> If you operate a pharmacy, handle prescription or
        other health-adjacent records, or need this reviewed against a specific jurisdiction's data protection law
        (including Zambia's Data Protection Act No. 3 of 2021), have a licensed attorney review it before relying on
        it for compliance purposes.
      </p>

      <h2>1. Who controls what</h2>
      <p>
        Uruu OS is multi-tenant business software: each signup creates an isolated "organization" workspace, and the
        people who run that business (its admins and staff) put their own operational data into it — products,
        sales, customers, pharmacy dispensing records, café/print-shop activity, and so on.
      </p>
      <ul>
        <li>
          For <strong>account and billing information</strong> (your name, email, phone, business name, and payment
          records with us), <strong>Uruu OS is the data controller</strong> — we decide how it's used, per this
          policy.
        </li>
        <li>
          For <strong>the content a workspace stores</strong> — its own customers' records, pharmacy dispensing
          history, sales, and similar business data — <strong>the tenant business is the data controller</strong>,
          and Uruu OS acts only as a data processor hosting and running the software on their behalf. If you are an
          end-customer of a business using Uruu OS (for example, a pharmacy's own patient) and want to exercise a
          data-protection right over your records, that request should go to that business directly, not to us —
          they control that data, not Uruu OS.
        </li>
      </ul>

      <h2>2. Information we collect</h2>
      <p><strong>Information you provide directly:</strong></p>
      <ul>
        <li>Account details: name, email address, and password (or, if you sign in with Google, your Google name/email — we never see your Google password).</li>
        <li>Business details: organization name, business type (general/retail, pharmacy, café, printing), and your chosen billing cycle.</li>
        <li>Optional contact details you or your admin add for your own team members or customers within your workspace.</li>
        <li>Payment records your platform admin enters when recording a payment (amount, currency, and an optional note such as which mobile money reference it relates to). We do not collect card numbers, mobile money PINs, or other payment credentials — billing is manual and processed off-platform.</li>
        <li>Anything else you or your team choose to store in your workspace: inventory, sales, pharmacy dispensing and prescription records, café/WiFi session data, printing job records, and activity logs.</li>
      </ul>
      <p><strong>Information collected automatically:</strong></p>
      <ul>
        <li>Basic usage analytics (pages viewed, aggregate performance metrics) via Vercel Analytics — this does not use cross-site advertising trackers.</li>
        <li>Standard web request metadata (IP address, browser/device type, timestamps) retained briefly for security and abuse-prevention purposes.</li>
        <li>Session and preference data stored in your browser's local storage: your login session (managed by our authentication provider, Supabase), which organization you're currently working in, and a temporary "pending signup" record used only to finish creating your workspace after email confirmation or a Google sign-in redirect — cleared automatically once used.</li>
        <li>When you complete the verification challenge on the signup form, Cloudflare Turnstile assesses whether the request looks automated; see Cloudflare's own privacy policy for how that check works.</li>
      </ul>
      <p>We do not use third-party advertising cookies, and we do not sell or rent your information to anyone.</p>

      <h2>3. How we use information</h2>
      <ul>
        <li>To create and operate your account and workspace, including enforcing that each organization's data stays isolated from every other organization's.</li>
        <li>To authenticate you and keep your account secure.</li>
        <li>To send account-related notices: trial and billing reminders, security alerts, and responses to support requests.</li>
        <li>To detect and prevent fraud, abuse, and automated signups.</li>
        <li>To maintain, troubleshoot, and improve the Service.</li>
        <li>To comply with applicable law, or respond to a valid legal request.</li>
      </ul>

      <h2>4. Who we share information with</h2>
      <p>
        We do not sell your data. We share it only with the infrastructure providers ("sub-processors") that make
        the Service work, each limited to what they need to perform their function:
      </p>
      <ul>
        <li><strong>Supabase</strong> — our database, authentication, and backend hosting provider. Your workspace's data is stored on Supabase infrastructure in the EU (Frankfurt, Germany).</li>
        <li><strong>Vercel</strong> — hosts the web application and provides basic aggregate usage analytics.</li>
        <li><strong>Cloudflare</strong> — provides bot/abuse protection (Turnstile) on the signup form.</li>
        <li><strong>Google</strong> — only if you choose "Continue with Google" to sign in, in which case Google shares your name and email with us per your Google account settings.</li>
      </ul>
      <p>
        We may also disclose information if required by law, to protect the rights, property, or safety of Uruu OS,
        our users, or the public, or in connection with a merger, acquisition, or sale of assets (with notice to
        affected users where required).
      </p>

      <h2>5. Data retention</h2>
      <p>
        We keep your account and workspace data for as long as your account is active. If a platform admin removes a
        tenant ("Delete tenant"), that workspace is locked immediately and hidden from the admin's tenant list, but
        its records are not immediately erased — this mirrors how the platform already avoids destroying financial
        and sales history that may be needed for reference, and is standard practice for business record-keeping. If
        you want your organization's data permanently and fully erased, contact us at the email below and we will
        process that request.
      </p>

      <h2>6. Security</h2>
      <ul>
        <li>All traffic to the Service is encrypted in transit (HTTPS/TLS).</li>
        <li>Passwords are never stored in plain text — authentication is handled by Supabase Auth, which stores only salted, hashed passwords.</li>
        <li>Every organization's data is isolated at the database level using row-level security: even if one account were compromised, Postgres itself refuses to return another organization's rows to it.</li>
        <li>The public signup form is protected against automated/bot signups by Cloudflare Turnstile.</li>
        <li>No system is perfectly secure, and we cannot guarantee absolute security — but we treat data isolation and account security as core to how this platform is built, not an afterthought.</li>
      </ul>

      <h2>7. Your rights</h2>
      <p>
        Depending on where you're located, you may have rights to access, correct, export, or delete the personal
        information we hold about you, or to object to certain processing. To exercise any of these rights over your
        Uruu OS account or billing information, contact us using the details below. As explained in Section 1, if
        your request concerns data held inside someone else's workspace (for example, you're a customer of a
        pharmacy that uses Uruu OS), please contact that business directly.
      </p>

      <h2>8. Children's privacy</h2>
      <p>
        Uruu OS is business software and is not directed at, or knowingly used to collect information from, children
        under 18. If you believe a child has provided us with personal information, contact us and we will remove it.
      </p>

      <h2>9. International data transfers</h2>
      <p>
        Our infrastructure is hosted in the European Union (Frankfurt, Germany), regardless of where you or your
        business is located. By using the Service, you consent to your information being processed and stored there.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy as the Service changes. We'll update the "Last updated" date above when we do, and
        for material changes we'll make a reasonable effort to notify account admins directly (for example, by
        email).
      </p>

      <h2>11. Contact us</h2>
      <p>
        Questions about this policy, or a request concerning your data? Email{' '}
        <a href="mailto:shadowrootsec@gmail.com">shadowrootsec@gmail.com</a>, or WhatsApp{' '}
        <a href="https://wa.me/260979501830" target="_blank" rel="noopener noreferrer">0979 501 830</a>.
      </p>
    </LegalPageLayout>
  );
}

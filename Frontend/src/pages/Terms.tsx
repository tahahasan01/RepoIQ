import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  COMPANY_ADDRESS,
  COMPANY_LEGAL_NAME,
  DISPUTE_VENUE,
  EFFECTIVE_DATE,
  GOVERNING_LAW,
  LAST_UPDATED,
  LEGAL_DOCS_ARE_DRAFTS,
  LEGAL_EMAIL,
  LIABILITY_CAP,
  MINIMUM_AGE,
  PRODUCT_NAME,
  TERMS_CHANGE_NOTICE_DAYS,
} from "@/content/legal";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc list-inside space-y-2 ml-4">{children}</ul>;
}

export default function Terms() {
  useEffect(() => {
    document.title = "Terms of Service - RepoIQ";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16">
        {/* Header */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Terms of <span className="gradient-text">Service</span>
            </h1>
            <p className="text-muted-foreground">
              Effective {EFFECTIVE_DATE}. Last updated {LAST_UPDATED}.
            </p>
          </motion.div>
        </section>

        {/* Content */}
        <section className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-4xl mx-auto glass-panel p-6 md:p-12 rounded-2xl prose prose-invert max-w-none"
          >
            <div className="space-y-8 text-muted-foreground">
              {LEGAL_DOCS_ARE_DRAFTS && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
                  Draft. These terms are pending legal review and may change before launch.
                </p>
              )}

              <Section title="1. Agreement">
                <p>
                  These Terms of Service ("Terms") are an agreement between you and {COMPANY_LEGAL_NAME} ("we",
                  "us") for your use of {PRODUCT_NAME}, including the website, web app and API (the "Service").
                  By creating an account or using the Service you agree to these Terms. If you do not agree, do
                  not use the Service.
                </p>
                <p>
                  If you use the Service on behalf of an organization, such as your employer, you confirm that you
                  are authorized to accept these Terms for it, and "you" includes that organization.
                </p>
                <p>
                  Our <Link to="/privacy" className="text-link hover:underline">Privacy Policy</Link> explains
                  how we handle personal information and your source code.
                </p>
              </Section>

              <Section title="2. The Service">
                <p>
                  {PRODUCT_NAME} connects to your GitHub account and uses AI models to review repositories. It
                  can:
                </p>
                <List>
                  <li>analyse a repository and report findings and scores for security, quality, architecture and documentation;</li>
                  <li>answer questions about a repository in a chat;</li>
                  <li>generate architecture diagrams and improvement roadmaps;</li>
                  <li>propose fixes for selected findings and, once you approve them, open them as draft pull requests;</li>
                  <li>show team, organization and developer views, alerts and webhooks.</li>
                </List>
                <p>
                  An analysis reviews a sample of a repository's files, not necessarily all of them, and the
                  results say how many files were reviewed. We may add, change or remove features at any time.
                </p>
              </Section>

              <Section title="3. Your account">
                <List>
                  <li>
                    You sign in with a GitHub account. You must be at least {MINIMUM_AGE} years old and able to
                    form a binding contract to use the Service.
                  </li>
                  <li>
                    You are responsible for keeping your GitHub account secure and for activity that happens under
                    your {PRODUCT_NAME} account. Tell us promptly at{" "}
                    <a href={`mailto:${LEGAL_EMAIL}`} className="text-link hover:underline">{LEGAL_EMAIL}</a>{" "}
                    if you believe it has been misused.
                  </li>
                  <li>
                    You authorize us to access GitHub on your behalf within the permissions you grant when you
                    connect. You can revoke that access at any time in your GitHub settings, after which features
                    that need it will stop working.
                  </li>
                </List>
              </Section>

              <Section title="4. Your content">
                <p>
                  "Your Content" means the repositories, source code and other material the Service accesses
                  through your GitHub account, the questions and information you submit, and the results the
                  Service generates for you (findings, answers, diagrams, roadmaps and proposed fixes).
                </p>
                <List>
                  <li>
                    <strong>You keep ownership.</strong> You, or whoever licensed it to you, keep all rights in your
                    code and Your Content. These Terms do not transfer any ownership to us.
                  </li>
                  <li>
                    <strong>Licence to us.</strong> You give us a non-exclusive, worldwide, royalty-free licence to
                    access, copy, process, store, transmit and display Your Content only as needed to provide,
                    secure and support the Service for you, including sending it to the service providers listed in
                    our Privacy Policy. This licence ends when Your Content is deleted from the Service, except for
                    copies kept as the Privacy Policy describes (for example, in backups).
                  </li>
                  <li>
                    <strong>No training.</strong> We do not use Your Content to train AI models.
                  </li>
                  <li>
                    <strong>Your permission to connect code.</strong> You confirm that you are allowed to give the
                    Service access to the repositories you connect, including any code owned by your employer or a
                    third party.
                  </li>
                  <li>
                    <strong>Results.</strong> As between you and us, you may use the results generated for you
                    for any lawful purpose. Similar results may be generated for other users.
                  </li>
                </List>
              </Section>

              <Section title="5. AI output">
                <p>
                  Findings, scores, explanations, diagrams and fixes are produced automatically by AI models. They
                  may be wrong, incomplete or out of date. The Service can miss real problems, including security
                  vulnerabilities, and can report problems that do not exist. A proposed fix can introduce new bugs
                  or security issues.
                </p>
                <List>
                  <li>
                    The Service does not replace your own code review, testing or a professional security audit.
                  </li>
                  <li>
                    Auto-fix changes are shown to you as a diff and pushed only after you approve them, as a draft
                    pull request on a new branch. You are responsible for reviewing and testing any change before
                    you merge or deploy it.
                  </li>
                  <li>You decide how to act on the results, and you are responsible for those decisions.</li>
                </List>
              </Section>

              <Section title="6. Acceptable use">
                <p>You agree not to:</p>
                <List>
                  <li>connect repositories or use code you are not authorized to use;</li>
                  <li>use the Service to break the law or to infringe anyone's rights;</li>
                  <li>
                    access, or try to access, another user's data, or get around access controls, rate limits or
                    usage limits;
                  </li>
                  <li>
                    probe, scan or test the Service for vulnerabilities, except as described in the responsible
                    disclosure section of our{" "}
                    <Link to="/security" className="text-link hover:underline">Security</Link> page;
                  </li>
                  <li>
                    interfere with or overload the Service, or use automated means to create accounts or send
                    excessive requests;
                  </li>
                  <li>
                    plant instructions or content in a repository intended to manipulate the Service's AI into
                    acting against another user;
                  </li>
                  <li>
                    copy, resell or offer the Service to others, or use it to build a competing product or train
                    AI models, without our written permission;
                  </li>
                  <li>reverse engineer the Service, except where the law allows it despite this restriction.</li>
                </List>
              </Section>

              <Section title="7. Free service and usage limits">
                <List>
                  <li>The Service is currently provided free of charge. We do not charge fees or collect payment details.</li>
                  <li>
                    We do not offer any service level agreement, uptime commitment or guaranteed support. The
                    Service may be unavailable, slow or interrupted at times.
                  </li>
                  <li>
                    Usage limits apply, for example limits on requests, on daily AI usage per user and on how many
                    files an analysis reviews. We may change these limits.
                  </li>
                  <li>
                    If we introduce paid plans, we will tell you in advance and you will not be charged unless you
                    agree to the new terms.
                  </li>
                </List>
              </Section>

              <Section title="8. Third-party services">
                <p>
                  The Service depends on GitHub and on Anthropic, which provides the AI models. Your use of GitHub
                  is governed by GitHub's own terms. We are not responsible for third-party services, their
                  availability or their changes, which may affect the Service.
                </p>
              </Section>

              <Section title="9. Feedback">
                <p>
                  If you send us suggestions or feedback, we may use them without any obligation to you.
                </p>
              </Section>

              <Section title="10. Suspension and termination">
                <List>
                  <li>
                    You can stop using the Service at any time, and you can delete your account from your account
                    settings.
                  </li>
                  <li>
                    We may suspend or end your access if you breach these Terms, if your use creates a security or
                    legal risk for us or other users, or if the law requires it. Where practical we will tell you
                    first.
                  </li>
                  <li>
                    We may discontinue the Service. If we do, we will give reasonable notice where practical.
                  </li>
                </List>
                <p>
                  When your account ends, your right to use the Service ends, and your data is deleted as described
                  in our Privacy Policy. Sections 4 (ownership), 5, 11, 12, 13, 15 and 16 continue to apply.
                </p>
              </Section>

              <Section title="11. Disclaimers">
                <p>
                  To the extent permitted by law, the Service and all results are provided "as is" and "as
                  available", without warranties of any kind, whether express or implied, including warranties of
                  merchantability, fitness for a particular purpose, accuracy and non-infringement. We do not
                  warrant that the Service will be uninterrupted, error free or secure, or that it will find every
                  problem in your code.
                </p>
              </Section>

              <Section title="12. Limitation of liability">
                <p>
                  To the extent permitted by law, we will not be liable for any indirect, incidental, special,
                  consequential or punitive damages, or for any loss of profits, revenue, data or goodwill, arising
                  from or related to the Service or these Terms, including losses caused by acting on AI output or
                  by merging a proposed fix.
                </p>
                <p>
                  To the extent permitted by law, our total liability for all claims relating to the Service or
                  these Terms is limited to {LIABILITY_CAP}.
                </p>
                <p>
                  Nothing in these Terms limits liability that cannot be limited under applicable law, such as
                  liability for fraud, or for death or personal injury caused by negligence, or your rights as a
                  consumer that cannot be waived.
                </p>
              </Section>

              <Section title="13. Indemnity">
                <p>
                  To the extent permitted by law, you will defend and indemnify us against third-party claims
                  arising from Your Content or from your breach of these Terms.
                </p>
              </Section>

              <Section title="14. Changes to these terms">
                <p>
                  We may update these Terms. We will post the new version on this page and update the date at the
                  top. For material changes we will give at least {TERMS_CHANGE_NOTICE_DAYS} days' notice in the app
                  or by email before they take effect. If you keep using the Service after a change takes effect,
                  the updated Terms apply. If you do not agree, stop using the Service and delete your account.
                </p>
              </Section>

              <Section title="15. Governing law and disputes">
                <p>
                  These Terms are governed by {GOVERNING_LAW}, without regard to its conflict of law rules. Disputes
                  will be resolved in {DISPUTE_VENUE}, unless the law of the place where you live gives you the
                  right to bring proceedings there.
                </p>
              </Section>

              <Section title="16. General">
                <List>
                  <li>These Terms and the Privacy Policy are the entire agreement between you and us about the Service.</li>
                  <li>If any part of these Terms is found unenforceable, the rest remains in effect.</li>
                  <li>If we do not enforce a provision, that is not a waiver of our right to do so later.</li>
                  <li>
                    You may not transfer these Terms without our consent. We may transfer them in connection with a
                    merger, acquisition or sale of assets.
                  </li>
                </List>
              </Section>

              <Section title="17. Contact">
                <p>Questions about these Terms:</p>
                <ul className="space-y-2">
                  <li>
                    Email:{" "}
                    <a href={`mailto:${LEGAL_EMAIL}`} className="text-link hover:underline">
                      {LEGAL_EMAIL}
                    </a>
                  </li>
                  <li>
                    Post: {COMPANY_LEGAL_NAME}, {COMPANY_ADDRESS}
                  </li>
                </ul>
              </Section>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

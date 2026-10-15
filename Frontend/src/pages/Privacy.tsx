import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ANTHROPIC_COMMERCIAL_TERMS_URL,
  ANTHROPIC_PRIVACY_URL,
  BACKUP_RETENTION,
  COMPANY_ADDRESS,
  COMPANY_LEGAL_NAME,
  CONTACT_EMAIL,
  DATA_REGION,
  DATABASE_PROVIDER,
  EFFECTIVE_DATE,
  GITHUB_AUTHORIZED_APPS_URL,
  GITHUB_INSTALLATIONS_URL,
  GITHUB_PRIVACY_URL,
  HOSTING_PROVIDER,
  LAST_UPDATED,
  LEGAL_DOCS_ARE_DRAFTS,
  MINIMUM_AGE,
  PRODUCT_NAME,
} from "@/content/legal";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xl font-semibold text-foreground mb-3 mt-6">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc list-inside space-y-2 ml-4">{children}</ul>;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
      {children}
    </a>
  );
}

export default function Privacy() {
  useEffect(() => {
    document.title = "Privacy Policy - RepoIQ";
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
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Privacy <span className="gradient-text">Policy</span>
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
                  Draft. This policy is pending legal review and may change before launch.
                </p>
              )}

              <Section title="1. Who we are and what this policy covers">
                <p>
                  {PRODUCT_NAME} is operated by {COMPANY_LEGAL_NAME} ("we", "us"). {PRODUCT_NAME} reviews
                  GitHub repositories with AI: it scores code quality, security, architecture and
                  documentation, answers questions about a repository, and can propose fixes as pull
                  requests.
                </p>
                <p>
                  This policy explains what information {PRODUCT_NAME} collects when you use the website,
                  web app and API (together, the "Service"), how your source code is handled, who we share
                  information with, and the choices you have. Our{" "}
                  <Link to="/terms" className="text-link hover:underline">Terms of Service</Link> and{" "}
                  <Link to="/security" className="text-link hover:underline">Security</Link> page should be
                  read alongside it.
                </p>
              </Section>

              <Section title="2. Information we collect">
                <Sub title="2.1 Your GitHub account">
                  <p>
                    You sign in to {PRODUCT_NAME} with GitHub. When you do, we receive and store your GitHub
                    username, display name, bio and avatar URL, and a verified email address from your GitHub
                    account. If your account has no verified email address that GitHub shares with us, we
                    store your GitHub "noreply" address instead.
                  </p>
                  <p>
                    The web app does not offer password sign-in. If a password is ever set on an account, we
                    store only a one-way bcrypt hash of it, never the password itself.
                  </p>
                </Sub>

                <Sub title="2.2 Access to GitHub on your behalf">
                  <p>Depending on how {PRODUCT_NAME} is connected to GitHub, one of the following applies:</p>
                  <List>
                    <li>
                      <strong>OAuth App.</strong> GitHub issues us an access token with the scopes{" "}
                      <code>repo</code>, <code>read:user</code> and <code>user:email</code>. GitHub has no
                      read-only scope for private repositories, so <code>repo</code> gives read and write
                      access to the repositories your GitHub account can access. We store this token encrypted
                      (AES-256-GCM) in our database, and it is never sent to your browser.
                    </li>
                    <li>
                      <strong>GitHub App.</strong> You choose which repositories to install the app on, and it
                      requests only these permissions: Contents (read and write), Metadata (read-only), Pull
                      requests (read and write) and Email addresses (read-only). We store the installation ID.
                      Access tokens are requested from GitHub when needed, expire after one hour, and are
                      cached for at most 40 minutes.
                    </li>
                  </List>
                  <p>
                    We use write access only for auto-fix, and only after you approve the exact changes (see
                    section 3.4).
                  </p>
                </Sub>

                <Sub title="2.3 Repository information">
                  <p>
                    For the repositories your GitHub account can access, we store metadata from GitHub: name
                    and full name, description, main language, star, fork and open-issue counts, default
                    branch, whether the repository is private, its size, and when it was last updated on
                    GitHub.
                  </p>
                </Sub>

                <Sub title="2.4 Results you generate">
                  <List>
                    <li>
                      <strong>Analyses:</strong> scores, issue counts, the commit analysed, how many files were
                      read, and any error message.
                    </li>
                    <li>
                      <strong>Findings:</strong> for each issue found, the file path, line number, severity,
                      category, a description and a suggested fix. Descriptions and suggestions are written by
                      the AI model and may quote short pieces of your code.
                    </li>
                    <li>
                      <strong>Improvement roadmaps</strong> generated from the findings.
                    </li>
                    <li>
                      <strong>Chat:</strong> the questions you ask about a repository, the AI's answers (which
                      may quote your code) and the paths of any files you attached to a question.
                    </li>
                    <li>
                      <strong>Auto-fix runs:</strong> the findings you selected, the proposed changes (including
                      the full proposed contents of each file the fix would change, and the diff), the commit it
                      was based on, the branch and pull request created, and the outcome.
                    </li>
                  </List>
                </Sub>

                <Sub title="2.5 Organizations and teams">
                  <p>
                    If you use organizations and teams we store the organizations and teams you create, team
                    membership and roles, invitations (who invited whom, the role offered, the response and
                    when), which repositories are assigned to which teams, alerts raised for an organization and
                    who acknowledged them, and an audit log of organization actions.
                  </p>
                  <p>
                    After an analysis we also read contributor statistics and line-by-line authorship ("blame")
                    from GitHub and record, per developer: weekly commits, lines added and removed, share of
                    lines owned per file, and which developer's commit introduced the line a finding points
                    at. We record this only for contributors who are {PRODUCT_NAME} users and who can access the
                    repository on GitHub themselves.
                  </p>
                </Sub>

                <Sub title="2.6 Settings, profile and integrations">
                  <List>
                    <li>Notification preferences, your alert score threshold and auto-analysis preference.</li>
                    <li>Changes you make to your name and bio.</li>
                    <li>
                      A profile photo, if you upload one (images up to 5 MB). It is stored as a file on our
                      application server.
                    </li>
                    <li>
                      Webhooks you configure: the destination URL, the events you subscribe to, a signing
                      secret, and a record of each delivery attempt (event type, status, response code, time and
                      a short failure reason).
                    </li>
                  </List>
                </Sub>

                <Sub title="2.7 Technical and usage information">
                  <List>
                    <li>
                      Your IP address, which our servers receive with every request and which we use to rate
                      limit requests made without signing in (signed-in requests are counted against a hash of
                      the session token). Rate-limit counters expire after one hour. The IP address, token hash
                      or user ID is written to our logs when a limit is exceeded.
                    </li>
                    <li>
                      Server logs of slow or failed requests: the method, path, status, duration and a request
                      ID. Our hosting provider may keep its own connection logs.
                    </li>
                    <li>The number of AI tokens your account uses each day, so we can enforce a usage limit.</li>
                  </List>
                  <p>
                    We do not use third-party analytics, advertising or tracking tools.
                  </p>
                </Sub>
              </Section>

              <Section title="3. How your source code is handled">
                <Sub title="3.1 When we read it">
                  <p>
                    We fetch files from GitHub only when you ask for something that needs them: running an
                    analysis, asking a question with files attached, or requesting an auto-fix. An analysis reads
                    a sample of the repository's source files, by default up to 150 files of up to 50 KB each. A
                    chat question can include up to 3 files. Architecture diagrams are generated from the list of
                    file paths only, not file contents.
                  </p>
                </Sub>

                <Sub title="3.2 Where it goes">
                  <p>
                    The files (and, for diagrams, the file paths) are sent to Anthropic's Claude models through
                    Anthropic's API to produce findings, answers, diagrams and fixes. See section 5 for how
                    Anthropic handles this data.
                  </p>
                </Sub>

                <Sub title="3.3 What we keep, and for how long">
                  <p>
                    We do not keep a copy of your repository. Data derived from it is kept as follows:
                  </p>
                  <List>
                    <li>
                      <strong>Temporary cache (Redis):</strong> the list of files in a repository for up to 60
                      minutes, and file contents for up to 30 minutes.
                    </li>
                    <li>
                      <strong>Cached findings (Redis), up to 30 days:</strong> the findings for each file, keyed
                      by a hash of the file's contents, so unchanged files are not sent to the AI again. Because
                      the key is the content hash, if another account analyses a file with exactly the same
                      contents, the cached findings (not the file itself) are reused for it.
                    </li>
                    <li>
                      <strong>Architecture diagrams (Redis):</strong> up to 7 days.
                    </li>
                    <li>
                      <strong>Database:</strong> findings, chat messages and auto-fix runs, as described in
                      section 2.4. Auto-fix runs contain the full proposed contents of each file a fix would
                      change. These records are kept until you delete them, the repository is removed from your
                      account, or you delete your account.
                    </li>
                  </List>
                </Sub>

                <Sub title="3.4 Writing to your repositories">
                  <p>
                    {PRODUCT_NAME} writes to GitHub only for auto-fix. A fix is first shown to you as a diff.
                    Nothing is pushed until you approve that exact set of changes, and only if your GitHub
                    account has write access to the repository. The changes are then committed to a new branch
                    and opened as a draft pull request. {PRODUCT_NAME} never commits to an existing branch or
                    merges anything.
                  </p>
                </Sub>
              </Section>

              <Section title="4. How we use information">
                <List>
                  <li>
                    To provide the Service: syncing your repositories, running analyses, answering questions,
                    preparing fixes, showing team and organization views, raising alerts and delivering your
                    webhooks.
                  </li>
                  <li>To keep the Service secure and available, including rate limits and per-user AI usage limits.</li>
                  <li>To investigate errors and support requests.</li>
                  <li>To contact you about your account, security issues or changes to these terms.</li>
                </List>
                <p>
                  We do not sell personal information, we do not use it for advertising, and we do not use your
                  code or results to train AI models.
                </p>
              </Section>

              <Section title="5. AI processing and model training">
                <p>
                  {PRODUCT_NAME} does not use your code, findings or chat messages to train AI models. The code
                  and prompts we send to Anthropic are processed under Anthropic's commercial terms, which state
                  that Anthropic does not train its models on content submitted through its API by default.
                  Anthropic's own terms govern how long it retains that data. See Anthropic's{" "}
                  <ExternalLink href={ANTHROPIC_COMMERCIAL_TERMS_URL}>commercial terms</ExternalLink> and{" "}
                  <ExternalLink href={ANTHROPIC_PRIVACY_URL}>privacy policy</ExternalLink> for the current
                  position.
                </p>
              </Section>

              <Section title="6. Who we share information with">
                <p>We share information only with the following, and only as needed to run the Service:</p>
                <List>
                  <li>
                    <strong>Anthropic</strong>, our AI provider, which receives the code and questions described
                    in section 3.
                  </li>
                  <li>
                    <strong>GitHub</strong>, whose API we call on your behalf to read repositories and, when you
                    approve an auto-fix, to create a branch, commits and a draft pull request. GitHub's handling of
                    your data is covered by the{" "}
                    <ExternalLink href={GITHUB_PRIVACY_URL}>GitHub Privacy Statement</ExternalLink>.
                  </li>
                  <li>
                    <strong>Our hosting provider (currently {HOSTING_PROVIDER})</strong>, which runs our
                    application servers and background workers.
                  </li>
                  <li>
                    <strong>{DATABASE_PROVIDER}</strong>, which hosts our PostgreSQL database and Redis cache.
                  </li>
                  <li>
                    <strong>Webhook endpoints you configure</strong>, which receive the events you subscribe to.
                  </li>
                  <li>
                    <strong>Other members of your organizations and teams</strong>, who can see your name,
                    GitHub username, avatar and the developer insights described in section 2.5 for the
                    repositories they can see. You become a team member only by accepting an invitation.
                  </li>
                  <li>
                    <strong>Authorities or other parties</strong> when required by law, or to protect the rights,
                    safety or property of our users or the Service.
                  </li>
                  <li>
                    <strong>A successor</strong> in a merger, acquisition or sale of assets, subject to this
                    policy.
                  </li>
                </List>
              </Section>

              <Section title="7. Browser storage">
                <p>
                  {PRODUCT_NAME} does not use advertising or analytics cookies. The web app uses your browser's
                  storage to work:
                </p>
                <List>
                  <li>
                    <strong>Local storage:</strong> your sign-in tokens and basic profile, your theme preference,
                    and a cache of data you have viewed (for example repository lists and results) so pages load
                    quickly. The cache is stored per user and is not restored after 24 hours.
                  </li>
                  <li>
                    <strong>Session storage:</strong> page caches for the current tab, and a one-time value used
                    to protect the GitHub sign-in flow.
                  </li>
                </List>
                <p>
                  Signing out ends your session on our servers and removes the sign-in tokens and session caches
                  from your browser. Anyone with access to your browser profile can read its local storage, so
                  sign out on shared computers.
                </p>
                <p>
                  When pages display avatars or blog images, your browser loads them directly from GitHub
                  (avatars.githubusercontent.com) or Unsplash (images.unsplash.com), which receive your IP address
                  as part of that request.
                </p>
              </Section>

              <Section title="8. Retention and deletion">
                <p>
                  We keep your information while your account is active. You can delete your account at any time
                  from your account settings. This permanently deletes your user record and, with it, your
                  repositories, analyses, findings, roadmaps, chat messages, auto-fix runs, webhooks and their
                  delivery history, settings, the organizations you own (with their teams, alerts and audit logs),
                  your team memberships and invitations, and the developer insights recorded about you.
                </p>
                <p>Some data is not removed by account deletion:</p>
                <List>
                  <li>
                    Records of actions you took in organizations owned by someone else, such as audit log
                    entries, invitations you sent and alerts you acknowledged, are kept with the link to your
                    account removed.
                  </li>
                  <li>
                    An uploaded profile photo is not currently deleted automatically. Contact us and we will
                    delete it.
                  </li>
                  <li>
                    Cached data expires on the schedule in section 3.3 (at most 30 days).
                  </li>
                  <li>Database backups are kept by our database host for {BACKUP_RETENTION}.</li>
                  <li>
                    Branches and pull requests created in your repositories stay on GitHub, and your GitHub
                    authorization stays in place until you revoke it in GitHub's{" "}
                    <ExternalLink href={GITHUB_AUTHORIZED_APPS_URL}>authorized applications</ExternalLink> or{" "}
                    <ExternalLink href={GITHUB_INSTALLATIONS_URL}>installed apps</ExternalLink> settings.
                  </li>
                </List>
                <p>
                  If your GitHub account loses access to a repository, the next sync removes that repository and
                  its results from your {PRODUCT_NAME} account. You can also clear a repository's chat history.
                </p>
              </Section>

              <Section title="9. Security">
                <p>
                  We protect your information with measures including encryption of stored GitHub tokens,
                  HTTPS, and access checks that limit each account to its own data. No system is perfectly
                  secure. Our <Link to="/security" className="text-link hover:underline">Security</Link> page
                  describes the measures in place and how to report a vulnerability.
                </p>
              </Section>

              <Section title="10. Your choices and rights">
                <List>
                  <li>
                    <strong>Access and correction:</strong> you can see and edit your profile in the app, or ask
                    us for a copy of the personal information we hold about you.
                  </li>
                  <li>
                    <strong>Export:</strong> you can download analysis reports from the app.
                  </li>
                  <li>
                    <strong>Deletion:</strong> you can delete your account in the app, or ask us to.
                  </li>
                  <li>
                    <strong>Limiting access:</strong> you can revoke {PRODUCT_NAME}'s access to GitHub at any time
                    in your GitHub settings.
                  </li>
                </List>
                <p>
                  Depending on where you live, you may have further rights under data protection law, such as the
                  right to object to or restrict processing, or to complain to a data protection authority. To
                  make a request, email{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-link hover:underline">
                    {CONTACT_EMAIL}
                  </a>
                  . We may need to verify your identity before acting on it.
                </p>
              </Section>

              <Section title="11. Where data is processed">
                <p>
                  Our servers are hosted in {DATA_REGION}. Anthropic and GitHub may process data in other
                  countries, including the United States. Where the law requires it, we rely on appropriate
                  safeguards for these transfers.
                </p>
              </Section>

              <Section title="12. Children">
                <p>
                  The Service is not intended for anyone under {MINIMUM_AGE}, and we do not knowingly collect
                  their personal information. If you believe a child has given us personal information, contact
                  us and we will delete it.
                </p>
              </Section>

              <Section title="13. Changes to this policy">
                <p>
                  We will update this policy when the Service changes how it handles information. We will post the
                  new version on this page and update the date at the top. If a change is significant, we will
                  also tell you in the app or by email before it takes effect.
                </p>
              </Section>

              <Section title="14. Contact us">
                <p>Questions or requests about this policy:</p>
                <ul className="space-y-2">
                  <li>
                    Email:{" "}
                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-link hover:underline">
                      {CONTACT_EMAIL}
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

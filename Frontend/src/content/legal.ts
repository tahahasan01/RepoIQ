/**
 * Company-specific values used by the Privacy Policy, Terms of Service and
 * Security pages (src/pages/Privacy.tsx, Terms.tsx, Security.tsx).
 *
 * THESE PAGES ARE DRAFTS. They were written to describe what the code actually
 * does, but they have not been reviewed by a lawyer. They MUST be reviewed by
 * qualified legal counsel, for every jurisdiction you operate in, before launch.
 *
 * Every value in [square brackets] is a placeholder the owner must replace.
 * When the documents have been reviewed and every placeholder is filled in,
 * set LEGAL_DOCS_ARE_DRAFTS to false to remove the "draft" notice shown at the
 * top of each page.
 *
 * If the product changes (new sub-processor, new data stored, a change to the
 * GitHub permissions requested, analytics added), these pages must be updated
 * in the same change.
 */

/** Shows a "draft, pending legal review" notice on each legal page while true. */
export const LEGAL_DOCS_ARE_DRAFTS = true;

/** The product name as it appears in the documents. */
export const PRODUCT_NAME = "RepoIQ";

/** The legal entity that operates the service and is party to the Terms. */
export const COMPANY_LEGAL_NAME = "[Company legal name]";

/** Registered postal address of that entity. */
export const COMPANY_ADDRESS = "[Registered company address]";

/** Public URL of the service. */
export const SERVICE_URL = "[https://your-domain]";

/** Contact for privacy requests (access, correction, deletion). */
export const CONTACT_EMAIL = "[privacy@your-domain]";

/** Contact for questions about the Terms of Service. */
export const LEGAL_EMAIL = "[legal@your-domain]";

/** Contact for vulnerability reports and security questions. */
export const SECURITY_EMAIL = "[security@your-domain]";

/** Date the current version of the documents takes effect. */
export const EFFECTIVE_DATE = "[date]";

/** Date the documents were last changed. */
export const LAST_UPDATED = "[date]";

/** Law that governs the Terms, e.g. "the laws of England and Wales". */
export const GOVERNING_LAW = "[jurisdiction]";

/** Courts with jurisdiction over disputes, e.g. "the courts of London". */
export const DISPUTE_VENUE = "[courts / venue]";

/** Minimum age to use the service. Depends on where you offer it. */
export const MINIMUM_AGE = "[minimum age]";

/** Liability cap for a free service, e.g. "USD 100". */
export const LIABILITY_CAP = "[amount]";

/** Notice given before material changes to the Terms take effect. */
export const TERMS_CHANGE_NOTICE_DAYS = "[number of]";

/**
 * Application hosting. Verified from the deploy configuration
 * (railway.toml, Backend/railway*.toml). Update if you move.
 */
export const HOSTING_PROVIDER = "Railway";

/** Who hosts PostgreSQL and Redis (often the same as HOSTING_PROVIDER). */
export const DATABASE_PROVIDER = "[database and Redis host]";

/** Where data is hosted, e.g. "the United States". */
export const DATA_REGION = "[hosting region]";

/** How long database backups are kept by the database host. */
export const BACKUP_RETENTION = "[backup retention period]";

/** How quickly security reports are acknowledged. */
export const SECURITY_ACK_TIME = "[number of business days]";

// Third-party documents the pages link to.
export const ANTHROPIC_COMMERCIAL_TERMS_URL = "https://www.anthropic.com/legal/commercial-terms";
export const ANTHROPIC_PRIVACY_URL = "https://www.anthropic.com/legal/privacy";
export const GITHUB_PRIVACY_URL =
  "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement";
export const GITHUB_AUTHORIZED_APPS_URL = "https://github.com/settings/applications";
export const GITHUB_INSTALLATIONS_URL = "https://github.com/settings/installations";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { useEffect } from "react";

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
              Last updated: January 27, 2026
            </p>
          </motion.div>
        </section>

        {/* Content */}
        <section className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-4xl mx-auto glass-panel p-12 rounded-2xl prose prose-invert max-w-none"
          >
            <div className="space-y-8 text-muted-foreground">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">1. Introduction</h2>
                <p>
                  At RepoIQ, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service. By using RepoIQ, you agree to the collection and use of information in accordance with this policy.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">2. Information We Collect</h2>
                
                <h3 className="text-xl font-semibold text-foreground mb-3">2.1 Information You Provide</h3>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Account information (name, email, GitHub username)</li>
                  <li>GitHub access tokens (encrypted)</li>
                  <li>Repository metadata and analysis results</li>
                  <li>Communication preferences</li>
                </ul>

                <h3 className="text-xl font-semibold text-foreground mb-3 mt-6">2.2 Information We Collect Automatically</h3>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Usage data (features used, time spent, actions taken)</li>
                  <li>Device information (browser type, OS, IP address)</li>
                  <li>Performance metrics and error logs</li>
                </ul>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">3. How We Use Your Information</h2>
                <p className="mb-4">We use the information we collect to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Provide, maintain, and improve our services</li>
                  <li>Analyze your code repositories and generate insights</li>
                  <li>Send you technical notices, updates, and security alerts</li>
                  <li>Respond to your comments, questions, and requests</li>
                  <li>Monitor and analyze usage patterns and trends</li>
                  <li>Detect, prevent, and address technical issues and security vulnerabilities</li>
                </ul>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">4. Data Security</h2>
                <p className="mb-4">We implement industry-standard security measures to protect your data:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Encryption:</strong> All data is encrypted in transit (TLS 1.3) and at rest (AES-256-GCM)</li>
                  <li><strong>Access Control:</strong> Strict access controls and authentication mechanisms</li>
                  <li><strong>Regular Audits:</strong> Security audits and vulnerability assessments</li>
                  <li><strong>Zero Retention:</strong> We don't permanently store your source code—only analysis results</li>
                  <li><strong>Compliance:</strong> SOC 2 Type II certified infrastructure</li>
                </ul>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">5. Data Sharing and Disclosure</h2>
                <p className="mb-4">We do not sell your personal information. We may share your information only in the following circumstances:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>With Your Consent:</strong> When you explicitly authorize us to share information</li>
                  <li><strong>Service Providers:</strong> With third-party vendors who perform services on our behalf (hosting, analytics)</li>
                  <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                  <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                </ul>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">6. Your Rights and Choices</h2>
                <p className="mb-4">You have the following rights regarding your personal information:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Access:</strong> Request a copy of your personal data</li>
                  <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                  <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                  <li><strong>Export:</strong> Download your analysis results and reports</li>
                  <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications</li>
                </ul>
                <p className="mt-4">To exercise these rights, contact us at privacy@repoiq.dev</p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">7. Data Retention</h2>
                <p>
                  We retain your information for as long as your account is active or as needed to provide services. Repository source code is processed in memory and never permanently stored. Analysis results are retained until you delete them or close your account.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">8. Cookies and Tracking</h2>
                <p className="mb-4">We use cookies and similar technologies to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Maintain your session and remember your preferences</li>
                  <li>Understand how you use our service</li>
                  <li>Improve performance and user experience</li>
                </ul>
                <p className="mt-4">You can control cookies through your browser settings.</p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">9. Children's Privacy</h2>
                <p>
                  RepoIQ is not intended for users under 13 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">10. International Data Transfers</h2>
                <p>
                  Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">11. Changes to This Policy</h2>
                <p>
                  We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date. Continued use of our service after changes constitutes acceptance of the updated policy.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">12. Contact Us</h2>
                <p className="mb-4">If you have questions about this Privacy Policy, please contact us:</p>
                <ul className="space-y-2">
                  <li>Email: <a href="mailto:privacy@repoiq.dev" className="text-primary hover:underline">privacy@repoiq.dev</a></li>
                  <li>Address: RepoIQ Inc., 123 Code Street, San Francisco, CA 94105</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

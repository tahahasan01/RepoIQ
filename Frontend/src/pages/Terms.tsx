import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { useEffect } from "react";

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
                <h2 className="text-2xl font-bold text-foreground mb-4">1. Agreement to Terms</h2>
                <p>
                  By accessing or using RepoIQ ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these terms, you may not access the Service.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">2. Description of Service</h2>
                <p>
                  RepoIQ is a code intelligence platform that analyzes GitHub repositories to provide insights on code quality, security vulnerabilities, architecture, and best practices. The Service includes web-based dashboards, API access, and automated analysis features.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">3. User Accounts</h2>
                
                <h3 className="text-xl font-semibold text-foreground mb-3">3.1 Account Creation</h3>
                <p>You must create an account to use the Service. You agree to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4 mt-2">
                  <li>Provide accurate, current, and complete information</li>
                  <li>Maintain and promptly update your account information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Accept responsibility for all activities under your account</li>
                  <li>Notify us immediately of any unauthorized use</li>
                </ul>

                <h3 className="text-xl font-semibold text-foreground mb-3 mt-6">3.2 Account Eligibility</h3>
                <p>You must be at least 13 years old to use the Service. By using the Service, you represent that you meet this requirement.</p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">4. Acceptable Use</h2>
                <p className="mb-4">You agree not to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Violate any applicable laws or regulations</li>
                  <li>Infringe on intellectual property rights of others</li>
                  <li>Transmit malware, viruses, or harmful code</li>
                  <li>Attempt to gain unauthorized access to the Service</li>
                  <li>Interfere with or disrupt the Service or servers</li>
                  <li>Use the Service for any illegal or unauthorized purpose</li>
                  <li>Reverse engineer, decompile, or disassemble the Service</li>
                  <li>Use automated systems to access the Service without permission</li>
                  <li>Share your account credentials with others</li>
                </ul>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">5. GitHub Integration</h2>
                <p className="mb-4">The Service integrates with GitHub. By using the Service, you acknowledge that:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>You grant RepoIQ permission to access your GitHub repositories</li>
                  <li>You are responsible for managing GitHub access permissions</li>
                  <li>We process your code in accordance with our Privacy Policy</li>
                  <li>We do not permanently store your source code</li>
                  <li>You comply with GitHub's Terms of Service</li>
                </ul>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">6. Subscription and Payments</h2>
                
                <h3 className="text-xl font-semibold text-foreground mb-3">6.1 Pricing</h3>
                <p>Certain features require a paid subscription. Current pricing is available on our pricing page and may change with notice.</p>

                <h3 className="text-xl font-semibold text-foreground mb-3 mt-6">6.2 Billing</h3>
                <p className="mb-2">For paid subscriptions:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Subscriptions automatically renew unless cancelled</li>
                  <li>You authorize us to charge your payment method</li>
                  <li>Refunds are provided in accordance with our refund policy</li>
                  <li>We may suspend access for non-payment</li>
                </ul>

                <h3 className="text-xl font-semibold text-foreground mb-3 mt-6">6.3 Free Trial</h3>
                <p>Free trials may be offered. At the end of the trial period, your subscription will begin unless cancelled.</p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">7. Intellectual Property</h2>
                
                <h3 className="text-xl font-semibold text-foreground mb-3">7.1 Service Content</h3>
                <p>The Service and its original content, features, and functionality are owned by RepoIQ and are protected by copyright, trademark, and other laws.</p>

                <h3 className="text-xl font-semibold text-foreground mb-3 mt-6">7.2 Your Content</h3>
                <p>You retain all rights to your code and repositories. You grant us a limited license to process and analyze your code to provide the Service.</p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">8. Disclaimers</h2>
                <p className="mb-4">THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee that:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>The Service will be uninterrupted or error-free</li>
                  <li>Defects will be corrected</li>
                  <li>The Service is free of viruses or harmful components</li>
                  <li>Analysis results are 100% accurate or complete</li>
                </ul>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">9. Limitation of Liability</h2>
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, REPOIQ SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">10. Indemnification</h2>
                <p>
                  You agree to indemnify and hold harmless RepoIQ from any claims, damages, losses, liabilities, and expenses arising from your use of the Service or violation of these Terms.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">11. Termination</h2>
                <p className="mb-4">We may terminate or suspend your account and access to the Service:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>For violations of these Terms</li>
                  <li>For fraudulent, abusive, or illegal activity</li>
                  <li>At our sole discretion with or without notice</li>
                </ul>
                <p className="mt-4">You may terminate your account at any time through your account settings.</p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">12. Changes to Terms</h2>
                <p>
                  We reserve the right to modify these Terms at any time. We will notify you of material changes. Continued use of the Service after changes constitutes acceptance of the updated Terms.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">13. Governing Law</h2>
                <p>
                  These Terms shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law provisions.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">14. Contact Information</h2>
                <p className="mb-4">For questions about these Terms, contact us:</p>
                <ul className="space-y-2">
                  <li>Email: <a href="mailto:legal@repoiq.dev" className="text-primary hover:underline">legal@repoiq.dev</a></li>
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

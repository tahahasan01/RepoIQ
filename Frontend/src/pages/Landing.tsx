import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { SecuritySection } from "@/components/landing/SecuritySection";
import { CTASection } from "@/components/landing/CTASection";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function Landing() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash === "#features") {
      // slight delay to ensure component layout is ready
      setTimeout(() => {
        document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }

    if (location.hash === "#pricing") {
      setTimeout(() => {
        document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
    if (location.hash === "#security") {
      setTimeout(() => {
        document.getElementById("security")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [location]);

  useEffect(() => {
    document.title = "RepoIQ — Home";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
        <SecuritySection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

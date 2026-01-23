import { motion } from "framer-motion";
import { Loader2, Github, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/api";

const codingQuotes = [
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Simplicity is prerequisite for reliability.", author: "Edsger Dijkstra" },
  { text: "Clean code always looks like it was written by someone who cares.", author: "Robert C. Martin" },
  { text: "Before software can be reusable it first has to be usable.", author: "Ralph Johnson" },
];

export default function SignUp() {
  const [isLoading, setIsLoading] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => setQuoteIndex((i) => (i + 1) % codingQuotes.length), 4000);
    return () => clearInterval(id);
  }, []);

  const handleGitHubOnly = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.getGitHubAuthUrl();
      if (res?.auth_url) {
        window.location.href = res.auth_url;
      }
    } catch (err) {
      toast({ title: "Error", description: "Unable to start GitHub signup." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-gradient-to-br from-background via-background to-purple-950/20">
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-600/20 via-teal-500/10 to-transparent hidden md:flex items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(6,182,212,0.15),transparent_50%)]" />
        <div className="relative w-full max-w-xl px-12 space-y-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-cyan-400 mb-2">
              <span className="text-3xl font-bold">{`</>`}</span>
              <span className="text-3xl font-bold text-white">Welcome to <span className="text-cyan-400">RepoIQ</span></span>
            </div>
            <p className="text-base text-gray-400 ml-12">
              AI-Powered Code Intelligence Platform
            </p>
          </div>
          <motion.div
            key={quoteIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md p-6 bg-gray-900/60 backdrop-blur-sm rounded-xl border border-gray-800/50 ml-12"
          >
            <div className="flex items-center gap-3 text-cyan-400 mb-4">
              <Quote className="h-5 w-5" />
              <span className="text-xs uppercase tracking-wider font-semibold">Daily dev note</span>
            </div>
            <p className="text-xl font-semibold leading-relaxed text-white">
              "{codingQuotes[quoteIndex].text}"
            </p>
            <p className="mt-4 text-sm text-gray-400">— {codingQuotes[quoteIndex].author}</p>
          </motion.div>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="bg-gray-900/40 backdrop-blur-sm rounded-2xl border border-gray-800/50 p-10 shadow-2xl">
            <h2 className="text-3xl font-bold text-white">Sign up</h2>
            <p className="text-base text-gray-400 mt-2">Create your RepoIQ account</p>
            <div className="mt-8 space-y-6">
              <Button
                variant="outline"
                size="lg"
                className="w-full gap-3 bg-white hover:bg-gray-100 text-gray-900 border-0 h-12 text-base font-medium"
                onClick={handleGitHubOnly}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Github className="h-5 w-5" />
                    Continue with GitHub
                  </>
                )}
              </Button>

              <div className="text-center text-sm text-gray-400">
                Already have an account? <Link to="/login" className="text-cyan-400 hover:text-cyan-300 hover:underline font-medium">Log in</Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

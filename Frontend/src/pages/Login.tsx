import { motion } from "framer-motion";
import { Github, X, Eye, EyeOff, Loader2, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useRole } from "@/hooks/useRole";
import apiClient from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const codingQuotes = [
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Code is like humor. When you have to explain it, it’s bad.", author: "Cory House" },
  { text: "Programs must be written for people to read.", author: "Harold Abelson" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
];

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const navigate = useNavigate();
  const { setRole } = useRole();
  const auth = useAuth();

  useEffect(() => {
    const id = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % codingQuotes.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const handleGitHubLogin = () => {
    setIsLoading(true);
    apiClient.getGitHubAuthUrl().then((res) => {
      if (res?.auth_url) {
        window.location.href = res.auth_url;
      }
    }).catch((err) => console.error("GitHub auth url failed", err)).finally(() => setIsLoading(false));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    apiClient.login(email, password).then((res) => {
      if (res?.access_token && res?.user) {
        auth.login(res.user, res.access_token, res.refresh_token);
        setRole("owner");
        navigate("/repos");
      }
    }).catch((err) => {
      console.error("Login failed", err);
    }).finally(() => setIsLoading(false));
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-cyan-500/10 to-background hidden md:flex items-center justify-center">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_left,#06b6d4,transparent_45%),radial-gradient(circle_at_bottom_right,#8b5cf6,transparent_45%)]" />
        <motion.div
          key={quoteIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
          className="relative max-w-xl p-10 text-left glass-panel border"
        >
          <div className="flex items-center gap-3 text-primary mb-4">
            <Quote className="h-5 w-5" />
            <span className="text-xs uppercase tracking-wide">Daily dev note</span>
          </div>
          <p className="text-2xl font-semibold leading-snug text-foreground">
            “{codingQuotes[quoteIndex].text}”
          </p>
          <p className="mt-4 text-sm text-muted-foreground">— {codingQuotes[quoteIndex].author}</p>
        </motion.div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold">Welcome back</h2>
            <button
              onClick={() => navigate("/")}
              aria-label="Close"
              className="rounded-full p-2 hover:bg-muted/40"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <Button
              variant="github"
              size="lg"
              className="w-full gap-3"
              onClick={handleGitHubLogin}
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

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="w-full px-3 py-2 rounded border border-input bg-background"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className="w-full px-3 py-2 rounded border border-input bg-background pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <Link to="/forgot" className="text-primary hover:underline">Forgot your password?</Link>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Continue
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground">
              Don't have an account? <Link to="/signup" className="text-primary hover:underline">Get started</Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

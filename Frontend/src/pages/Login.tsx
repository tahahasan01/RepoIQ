import { motion } from "framer-motion";
import { Github, X, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useRole } from "@/hooks/useRole";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setRole } = useRole();

  const handleGitHubLogin = () => {
    setIsLoading(true);
    // In real app: GitHub OAuth returns user info
    // Check if user is org owner or member
    // For demo: check localStorage or default to developer
    setRole("owner");
    localStorage.setItem("userRole", "owner");
    setTimeout(() => {
      navigate("/repos");
    }, 1200);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    // In real app: API returns user role based on email/account
    // For demo: ensure role is owner in owner-only app
    setRole("owner");
    localStorage.setItem("userRole", "owner");
    setTimeout(() => {
      setIsLoading(false);
      navigate("/repos");
    }, 900);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20">
      <div className="fixed inset-0 bg-black/40" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-md w-full mx-4"
      >
        <div className="modal-gradient-wrap rounded-xl">
          <div className="glass-panel rounded-lg overflow-hidden">
            <div className="p-6 bg-gradient-card relative">
              <div className="hero-glow" />

              <div className="flex items-start justify-between">
                <h2 className="text-2xl font-bold">Log In</h2>
                <button
                  onClick={() => navigate(-1)}
                  aria-label="Close"
                  className="rounded-full p-2 hover:bg-muted/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6">
                <Button
                  variant="github"
                  size="xl"
                  className="w-full gap-3 glow-primary"
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

                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">OR</span>
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

                  <div className="flex items-center justify-between">
                    <Link to="/forgot" className="text-sm text-primary hover:underline">Forgot your password?</Link>
                  </div>

                  <div>
                    <Button type="submit" className="w-full glow-primary" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Continue
                        </>
                      ) : (
                        "Continue"
                      )}
                    </Button>
                  </div>
                </form>

                <div className="text-center text-sm text-muted-foreground mt-4">
                  Don't have an account? <Link to="/signup" className="text-primary hover:underline">Get started</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Github, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/hooks/useRole";
import { Logo } from "@/components/Logo";

export default function SignUp() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setRole } = useRole();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setRole("owner");
      localStorage.setItem("demo_user_email", email);
      toast({ title: "Account created", description: "Signed up successfully." });
      navigate("/dashboard");
    } catch (err) {
      toast({ title: "Error", description: "Unable to sign up." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#071034] to-[#021024] p-6">
      <div className="modal-gradient-wrap p-1 rounded-2xl">
        <Card className="w-[420px]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Logo />
              <CardTitle>Create your account</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Email</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <div className="flex items-center justify-between">
                <Button type="submit">Create account</Button>
                <Link to="/login" className="text-sm text-muted-foreground">
                  Already have an account?
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

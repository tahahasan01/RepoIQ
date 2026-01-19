import React from "react";
import { Zap } from "lucide-react";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={className ?? "flex items-center gap-2"}>
      <div className="w-8 h-8 min-w-[32px] rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center">
        <Zap className="h-4 w-4 text-primary-foreground" />
      </div>
      <span className="font-bold">Repo<span className="gradient-text">IQ</span></span>
    </div>
  );
}

export default Logo;

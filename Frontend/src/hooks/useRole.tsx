import { createContext, useContext, ReactNode } from "react";

type UserRole = "owner";

interface RoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  isOwner: boolean;
  isDeveloper: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const role: UserRole = "owner";
  const setRole = (_: UserRole) => {
    // no-op: single-role app
  };

  return (
    <RoleContext.Provider
      value={{ role, setRole, isOwner: true, isDeveloper: false }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within RoleProvider");
  }
  return context;
}

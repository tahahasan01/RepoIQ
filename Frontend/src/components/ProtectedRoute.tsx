import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Route guard for authenticated pages.
 *
 * Every dashboard, settings, organization, team and executive route was
 * previously public. The API enforces authorization, so this was never a data
 * breach - but an unauthenticated visitor to /dashboard/:id got a rendered shell
 * that fired requests, collected 401s and settled into an error state, instead
 * of being sent to the login page. It also meant there was no single place that
 * expressed which routes require a session.
 *
 * This checks only for the presence of a token, which is all a client can do.
 * The token is still validated server-side on every request; a forged or expired
 * one gets a 401 and the `authExpired` handler in App.tsx routes back here.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();

  let hasToken = false;
  try {
    hasToken = Boolean(localStorage.getItem("token"));
  } catch {
    // Storage can throw in private browsing / blocked-cookie contexts. Treat it
    // as signed out rather than crashing the whole route tree.
    hasToken = false;
  }

  if (!hasToken) {
    // `state.from` lets the login page send the user back where they were
    // heading; `replace` keeps the guarded URL out of history so Back does not
    // bounce between login and a page they cannot see.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;

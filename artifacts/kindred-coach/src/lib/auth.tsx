import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { resolveReturnDestination } from "./routing";

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: {
    id: string | null;
    firstName: string | null;
    email: string | null;
  } | null;
  error: Error | undefined;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  login: (
    returnTo: string,
    signup?: boolean,
    connection?: LoginConnection,
  ) => Promise<void>;
}
/** Auth0's passwordless email connection; Universal Login shows it only when asked by name. */
export type LoginConnection = "email";
const publicState: AuthState = {
  isLoaded: false,
  isSignedIn: false,
  user: null,
  error: undefined,
  getToken: async () => null,
  signOut: async () => {},
  login: async () => {},
};
const AuthContext = createContext<AuthState>(publicState);
export const useAuth = () => useContext(AuthContext);
export const useUser = useAuth;
export function PublicAuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={publicState}>{children}</AuthContext.Provider>
  );
}

// The marketing-only site never signs anyone in: sign-in lives on the app
// domain. Report a settled, signed-out state so public pages render normally
// and checkout sends visitors to the app's sign-in.
const signedOutState: AuthState = { ...publicState, isLoaded: true };
export function SignedOutAuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={signedOutState}>
      {children}
    </AuthContext.Provider>
  );
}

function AuthBridge({ children }: { children: ReactNode }) {
  const auth = useAuth0();
  const [redirectError, setRedirectError] = useState<Error>();
  const getToken = useCallback(
    async () => (auth.isAuthenticated ? auth.getAccessTokenSilently() : null),
    [auth.isAuthenticated, auth.getAccessTokenSilently],
  );
  const signOut = useCallback(
    async () =>
      auth.logout({ logoutParams: { returnTo: `${window.location.origin}/` } }),
    [auth.logout],
  );
  const login = useCallback(
    async (returnTo: string, signup = false, connection?: LoginConnection) => {
      setRedirectError(undefined);
      try {
        await auth.loginWithRedirect({
          appState: { returnTo: resolveReturnDestination(returnTo) },
          authorizationParams: {
            ...(signup ? { screen_hint: "signup" } : {}),
            ...(connection ? { connection } : {}),
          },
        });
      } catch (err) {
        setRedirectError(
          err instanceof Error ? err : new Error("Sign-in failed"),
        );
      }
    },
    [auth.loginWithRedirect],
  );
  const value = useMemo<AuthState>(
    () => ({
      isLoaded: !auth.isLoading,
      isSignedIn: auth.isAuthenticated,
      user: auth.user
        ? {
            id: auth.user.sub ?? null,
            firstName: auth.user.given_name ?? null,
            email: auth.user.email ?? null,
          }
        : null,
      error: redirectError ?? auth.error,
      getToken,
      signOut,
      login,
    }),
    [
      auth.isLoading,
      auth.isAuthenticated,
      auth.user,
      auth.error,
      redirectError,
      getToken,
      signOut,
      login,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  if (!domain || !clientId || !audience) {
    return (
      <main className="p-8" role="alert">
        Sign-in is not configured. Please contact Kindred support.
      </main>
    );
  }
  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/`,
        audience,
        scope: "openid profile email offline_access",
      }}
      useRefreshTokens
      useRefreshTokensFallback
      useMrrt
      cacheLocation="memory"
      onRedirectCallback={(state) => {
        window.history.replaceState(
          {},
          "",
          resolveReturnDestination(state?.returnTo),
        );
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </Auth0Provider>
  );
}

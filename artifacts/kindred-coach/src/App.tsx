import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Redirect,
  Switch,
  Route,
  Router as WouterRouter,
  useLocation,
  useSearch,
} from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import {
  setAuthTokenGetter,
  useGetCurrentAuthUser,
  getGetCurrentAuthUserQueryKey,
} from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";
import { PublicLayout } from "@/components/layout/public-layout";
import Dashboard from "@/pages/dashboard";
import Morning from "@/pages/morning";
import Scans from "@/pages/scans";
import Evening from "@/pages/evening";
import Habits from "@/pages/habits";
import Medications from "@/pages/medications";
import Reports from "@/pages/reports";
import Profile from "@/pages/profile";
import CalendarPage from "@/pages/calendar";
import Chat from "@/pages/chat";
import Archive from "@/pages/archive";
import Reminders from "@/pages/reminders";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/public/landing";
import About from "@/pages/public/about";
import Science from "@/pages/public/science";
import Pricing from "@/pages/public/pricing";
import PaymentSuccess from "@/pages/public/payment-success";
import Login from "@/pages/public/login";
import Signup from "@/pages/public/signup";
import Account from "@/pages/account";
import AdminBeta from "@/pages/admin-beta";
import { ThemeProvider } from "@/hooks/use-theme";
import {
  canonicalPathname,
  protectedRouteLoginTarget,
  PRIVATE_ROUTE_PATTERN,
} from "@/lib/routing";
import { SignedInMetadata } from "@/components/signed-in-metadata";
import { LEGACY_PRIMARY_ROUTE_REDIRECTS } from "@/lib/navigation";
import {
  AIUseDisclosure,
  CookieNotice,
  HealthDisclaimer,
  MarketingConsent,
  PrivacyPolicy,
  TermsAndConditions,
} from "@/pages/public/legal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Wires Auth0's API access token into the API client so every /api request carries
// `Authorization: Bearer <token>` so the API can authenticate the user.
const AuthTokenReadyContext = createContext(false);

function AuthTokenBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, user } = useAuth();
  const [tokenBridgeReady, setTokenBridgeReady] = useState(false);
  const userId = user?.id ?? null;
  const [preparedUserId, setPreparedUserId] = useState<string | null>(null);

  useEffect(() => {
    // An identity arriving after mount must finish cache cleanup before its
    // account query starts. Otherwise clear() cancels and detaches that query.
    queryClient.clear();
    setPreparedUserId(userId);
  }, [userId]);

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    setTokenBridgeReady(true);

    return () => {
      setAuthTokenGetter(null);
      setTokenBridgeReady(false);
    };
  }, [getToken]);

  return (
    <AuthTokenReadyContext.Provider
      value={isLoaded && tokenBridgeReady && preparedUserId === userId}
    >
      {children}
    </AuthTokenReadyContext.Provider>
  );
}

function PublicRoutes() {
  return (
    <PublicLayout>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/about" component={About} />
        <Route path="/science" component={Science} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/payment-success" component={PaymentSuccess} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route component={NotFound} />
      </Switch>
    </PublicLayout>
  );
}

function PrivateRoutes() {
  const { isLoaded, isSignedIn } = useAuth();
  const tokenBridgeReady = useContext(AuthTokenReadyContext);
  const account = useGetCurrentAuthUser({
    query: {
      queryKey: getGetCurrentAuthUserQueryKey(),
      enabled: isLoaded && isSignedIn && tokenBridgeReady,
      retry: false,
    },
  });
  const [location, setLocation] = useLocation();
  const search = useSearch();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation(
        protectedRouteLoginTarget(
          window.location.pathname +
            window.location.search +
            window.location.hash,
        ),
        { replace: true },
      );
    }
  }, [isLoaded, isSignedIn, location, search, setLocation]);

  // React Query starts requests as soon as its consumers mount. Keep protected
  // pages unmounted until the shared API client can attach Auth0's bearer token;
  // public pages remain independent from Auth0 startup latency.
  if (!isLoaded || !isSignedIn || !tokenBridgeReady) {
    return null;
  }

  if (account.error) {
    const needsLink = (account.error as { status?: number }).status === 409;
    return (
      <main className="mx-auto max-w-lg space-y-4 p-8" role="alert">
        <h1 className="text-2xl font-serif">
          {needsLink
            ? "Link your existing Kindred account"
            : "We couldn’t open your account"}
        </h1>
        <p>
          {needsLink
            ? "Contact Kindred support to link your sign-in and keep your coaching history and subscription."
            : "Please try again. If this continues, sign in again or contact Kindred support."}
        </p>
        <button className="underline" onClick={() => void account.refetch()}>
          Try again
        </button>
      </main>
    );
  }
  if (account.isLoading)
    return (
      <p role="status" className="p-8">
        Opening your account…
      </p>
    );

  const canonical = LEGACY_PRIMARY_ROUTE_REDIRECTS[canonicalPathname(location)];
  if (canonical) {
    return (
      <Redirect
        to={`${canonical}${window.location.search}${window.location.hash}`}
        replace
        state={window.history.state}
      />
    );
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/today" component={Dashboard} />
        <Route path="/talk" component={Chat} />
        <Route path="/insights" component={Reports} />
        <Route path="/you" component={Profile} />
        <Route path="/app/morning" component={Morning} />
        <Route path="/app/scans" component={Scans} />
        <Route path="/app/evening" component={Evening} />
        <Route path="/app/habits" component={Habits} />
        <Route path="/app/medications" component={Medications} />
        <Route path="/app/account" component={Account} />
        <Route path="/app/admin/beta" component={AdminBeta} />
        <Route path="/app/calendar" component={CalendarPage} />
        <Route path="/app/archive" component={Archive} />
        <Route path="/app/reminders" component={Reminders} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

// Legal pages are fully static and require no authentication context.
// Rendering them outside AuthProvider prevents authentication SDK from being fetched
// on these routes, making them resilient to authentication provider failures.
const LEGAL_ROUTES: Record<string, () => ReactElement> = {
  "/legal/privacy": PrivacyPolicy,
  "/legal/terms": TermsAndConditions,
  "/legal/health-disclaimer": HealthDisclaimer,
  "/legal/ai-disclosure": AIUseDisclosure,
  "/legal/cookies": CookieNotice,
  "/legal/marketing-consent": MarketingConsent,
};

function LegalShell() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <PublicLayout>
            <Switch>
              {Object.entries(LEGAL_ROUTES).map(([path, Component]) => (
                <Route key={path} path={path} component={Component} />
              ))}
            </Switch>
          </PublicLayout>
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function App() {
  // Serve legal pages without loading authentication at all.
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [pathname] = useLocation();
  const pathWithoutBase = base ? pathname.replace(base, "") || "/" : pathname;
  if (Object.keys(LEGAL_ROUTES).some((r) => pathWithoutBase === r)) {
    return <LegalShell />;
  }

  return (
    <AuthProvider>
      <AuthTokenBridge>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <TooltipProvider>
              <WouterRouter base={base}>
                <SignedInMetadata />
                <Switch>
                  <Route path="/" component={PublicRoutes} />
                  <Route path="/about" component={PublicRoutes} />
                  <Route path="/science" component={PublicRoutes} />
                  <Route path="/pricing" component={PublicRoutes} />
                  <Route path="/payment-success" component={PublicRoutes} />
                  <Route path="/login" component={PublicRoutes} />
                  <Route path="/signup" component={PublicRoutes} />
                  <Route path="/app/session-tasks/:task">
                    <Redirect to="/app/account" replace />
                  </Route>
                  <Route
                    path={PRIVATE_ROUTE_PATTERN}
                    component={PrivateRoutes}
                  />
                  <Route component={NotFound} />
                </Switch>
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </AuthTokenBridge>
    </AuthProvider>
  );
}

export default App;

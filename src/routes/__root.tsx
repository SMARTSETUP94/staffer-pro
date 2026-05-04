import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { PreviewProvider } from "@/lib/preview-context";
import appCss from "../styles.css?url";

declare global {
  interface Window {
    __setupParisReactMounted?: boolean;
    __setupParisBootErrors?: Array<{ type: string; at: string; payload: string }>;
  }
}

const BOOTSTRAP_GUARD_SCRIPT = String.raw`
(function () {
  window.__setupParisBootErrors = window.__setupParisBootErrors || [];
  window.__setupParisReactMounted = false;
  var push = function (type, payload) {
    try {
      window.__setupParisBootErrors.push({ type: type, at: new Date().toISOString(), payload: String(payload && (payload.message || payload.reason || payload.error || payload)) });
    } catch (_) {}
  };
  window.addEventListener('error', function (event) { push('error', event.error || event.message || 'unknown'); }, true);
  window.addEventListener('unhandledrejection', function (event) { push('unhandledrejection', event.reason || 'unknown'); }, true);
  window.addEventListener('vite:preloadError', function (event) {
    push('vite:preloadError', event && event.payload ? event.payload : 'preload failed');
    try { event.preventDefault(); } catch (_) {}
    window.location.reload();
  }, true);

  try {
    if ('serviceWorker' in navigator && !sessionStorage.getItem('setup_paris_sw_cleanup_v1')) {
      sessionStorage.setItem('setup_paris_sw_cleanup_v1', '1');
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        if (!registrations.length) return;
        Promise.all(registrations.map(function (registration) { return registration.unregister(); })).then(function () {
          if (navigator.serviceWorker.controller) window.location.reload();
        });
      }).catch(function (error) { push('serviceWorkerCleanup', error); });
    }
  } catch (error) { push('serviceWorkerCleanup', error); }

  setTimeout(function () {
    if (window.__setupParisReactMounted) return;
    var root = document.body;
    if (!root) return;
    root.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:hsl(222 47% 11%);color:white;font-family:Inter,system-ui,sans-serif;padding:24px"><div style="max-width:520px;text-align:center"><h1 style="font-size:24px;margin:0 0 12px;font-weight:700">Erreur de chargement</h1><p style="margin:0 0 20px;color:hsl(215 20% 78%);line-height:1.5">L’application n’a pas réussi à démarrer. Rafraîchis la page ; si le problème persiste, vide le cache du navigateur.</p><button onclick="window.location.reload()" style="border:0;border-radius:8px;background:hsl(217 91% 60%);color:white;font-weight:600;padding:10px 16px;cursor:pointer">Rafraîchir la page</button></div></div>';
  }, 30000);
})();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La page que vous cherchez n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Setup Paris — Planning chantiers" },
      { name: "description", content: "Setup Paris : planning chantiers, staffing et import de devis pour la scénographie et fabrication de décors." },
      { property: "og:title", content: "Setup Paris — Planning chantiers" },
      { name: "twitter:title", content: "Setup Paris — Planning chantiers" },
      { property: "og:description", content: "Setup Paris : planning chantiers, staffing et import de devis pour la scénographie et fabrication de décors." },
      { name: "twitter:description", content: "Setup Paris : planning chantiers, staffing et import de devis pour la scénographie et fabrication de décors." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a6b12ab5-6c17-452a-99dc-7d8e58ea7c9e/id-preview-bec7ebf5--646285ee-aca4-406c-aa78-a85235d7e6e0.lovable.app-1776617083619.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a6b12ab5-6c17-452a-99dc-7d8e58ea7c9e/id-preview-bec7ebf5--646285ee-aca4-406c-aa78-a85235d7e6e0.lovable.app-1776617083619.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP_GUARD_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[root] uncaught render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground">Erreur de chargement</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            L’application n’a pas réussi à démarrer. Rafraîchis la page pour recharger la dernière version.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Rafraîchir la page
          </button>
        </div>
      </div>
    );
  }
}

function RootComponent() {
  // v0.29.2 hotfix — QueryClientProvider au root pour que useMutation/useQuery
  // (ex: useBulkAssignObjet sur /planning?vue=par-objet) trouvent un client.
  // useState garantit une instance stable par render tree (SSR-safe : nouveau
  // client par requête côté serveur).
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }));

  useEffect(() => {
    window.__setupParisReactMounted = true;
  }, []);

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PreviewProvider>
            <Outlet />
          </PreviewProvider>
        </AuthProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}

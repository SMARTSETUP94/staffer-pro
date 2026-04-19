import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth-context";
import { PreviewProvider } from "@/lib/preview-context";
import appCss from "../styles.css?url";

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

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <PreviewProvider>
        <Outlet />
      </PreviewProvider>
    </AuthProvider>
  );
}

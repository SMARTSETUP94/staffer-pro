import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/incident-auth")({
  beforeLoad: () => {
    throw redirect({ to: "/audit-auth", search: { tab: "incidents" } });
  },
});

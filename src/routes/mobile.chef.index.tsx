import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/mobile/chef/")({
  beforeLoad: () => {
    throw redirect({ to: "/mobile/chef/dashboard" });
  },
});

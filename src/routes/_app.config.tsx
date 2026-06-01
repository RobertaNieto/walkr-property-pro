import { createFileRoute, Navigate } from "@tanstack/react-router";

// Legacy pre-wizard config screen — Property Overview now lives in Section 1
// of the wizard itself, so this route just forwards to the section menu.
export const Route = createFileRoute("/_app/config")({
  component: () => <Navigate to="/wizard/menu" replace />,
});

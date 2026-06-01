import { createFileRoute, Navigate } from "@tanstack/react-router";

// Legacy lockbox screen — lockbox code + location now live in Section 1
// of the dynamic wizard. Forward to the section menu.
export const Route = createFileRoute("/_app/wizard/lockbox")({
  component: () => <Navigate to="/wizard/menu" replace />,
});

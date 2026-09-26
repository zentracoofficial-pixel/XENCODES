import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create account",
};

// The NGN/USD picker is hidden until a USD payment provider is connected
// (see register-form.tsx's own comment) — registerAction decides the
// currency itself, silently, via its own geo-IP lookup. Nothing here needs
// force-dynamic anymore since this page no longer reads the request.
export default function RegisterPage() {
  return <RegisterForm />;
}

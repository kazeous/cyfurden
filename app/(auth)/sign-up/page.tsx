import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Cyfurden account for your artist booths.",
};

export default function SignUpPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return <AuthPage googleEnabled={googleEnabled} mode="sign-up" />;
}

import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to manage your Cyfurden artist booths.",
};

export default function SignInPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return <AuthPage googleEnabled={googleEnabled} mode="sign-in" />;
}

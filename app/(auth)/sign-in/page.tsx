import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to manage your Cyfurden artist booths.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  const { returnTo } = await searchParams;
  return (
    <AuthPage
      googleEnabled={googleEnabled}
      mode="sign-in"
      returnTo={returnTo}
    />
  );
}

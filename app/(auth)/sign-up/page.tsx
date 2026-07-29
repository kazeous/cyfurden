import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { translate, type Locale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await readLocaleCookie()) as Locale;
  const auth = translate(locale, "publicAuth");
  return {
    title: auth.signUpTitle,
    description: auth.signUpBody,
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  const { returnTo } = await searchParams;
  const locale = (await readLocaleCookie()) as Locale;
  return (
    <AuthPage
      googleEnabled={googleEnabled}
      mode="sign-up"
      returnTo={returnTo}
      locale={locale}
    />
  );
}

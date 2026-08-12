import type { Metadata } from "next";
import { TwoFactorPage } from "@/components/auth/two-factor-page";
import { translate, type Locale } from "@/lib/i18n";
import { readLocaleCookie } from "@/lib/i18n/server-locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await readLocaleCookie()) as Locale;
  const auth = translate(locale, "publicAuth");
  return {
    title: auth.twoFactorTitle,
    description: auth.twoFactorBody,
  };
}

export default async function TwoFactorRoute() {
  const locale = (await readLocaleCookie()) as Locale;
  return <TwoFactorPage locale={locale} />;
}

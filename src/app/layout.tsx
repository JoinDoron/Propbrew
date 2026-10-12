import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider, themeInitScript } from '@/components/theme-provider';
import { brand } from '@/config/brand';
import './globals.css';

// The template's typeface pairing: Inter Tight for UI, JetBrains Mono for
// refs, VINs, money and anything that benefits from tabular alignment.
const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: 'Propbrew connects property operations, construction and communities in one intelligent workspace. Built for Nigeria and a brighter property future.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Runs before paint so the persisted theme never flashes. `next/script`
            with beforeInteractive is injected by Next into the document head and
            avoids React's "script tag in component" warning. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {/* AppShell now lives in each authenticated route group's layout, so the
            root layout carries only fonts, theme init and globals. */}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

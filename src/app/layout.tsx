import type { Metadata } from 'next';
import { Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
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
  description: 'Logistics management platform.',
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
      <head>
        {/* Runs before paint so the persisted theme never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}

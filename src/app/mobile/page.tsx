import type { Metadata } from 'next';
import { MobileShowcase } from '@/components/mobile/mobile-showcase';

export const metadata: Metadata = { title: 'Propbrew Resident · Native app preview', description: 'Interactive preview of the Propbrew resident mobile application.' };

export default function MobilePreviewPage() { return <MobileShowcase />; }

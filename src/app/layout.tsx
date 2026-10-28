import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'GroupTable — Lunch, accounted for.', description: 'Turn group meal requests into a checked order. Local demonstration with PayPal Sandbox.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

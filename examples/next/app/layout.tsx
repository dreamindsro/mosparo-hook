import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'mosparo-hook example',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <a href="/">Fetch + route handler</a>
          <a href="/server-action">Server action</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}

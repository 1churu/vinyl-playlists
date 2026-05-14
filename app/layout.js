import './globals.css';

export const metadata = {
  title: 'CRATE DIGGER · Vinyl OS',
  description: 'Your Spotify playlists as vinyl records',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#080808' }}>{children}</body>
    </html>
  );
}

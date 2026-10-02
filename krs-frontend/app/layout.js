import './globals.css';

export const metadata = { title: 'KRS Online - Universitas Charlie' };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

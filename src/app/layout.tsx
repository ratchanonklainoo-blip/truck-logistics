import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ณสิริทรัพย์ Logistics OS',
  description: 'ระบบจัดการรถพ่วง หจก.ณสิริทรัพย์ การเกษตร',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sarabun">{children}</body>
    </html>
  );
}

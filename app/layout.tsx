import './globals.css';

export const metadata = {
  title: { default: 'Lokmaco', template: '%s · Lokmaco' },
  description: 'Управление сетью',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    var theme = localStorage.getItem('lokmaco_theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    if (localStorage.getItem('lokmaco_sidebar_collapsed') === 'true') {
      document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
    }
  } catch(e) {}
})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

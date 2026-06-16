import "./styles.css";

export const metadata = {
  title: "Process Intelligence Platform",
  description: "Vercel-hosted process mining dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

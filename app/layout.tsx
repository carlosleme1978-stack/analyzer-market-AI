export const metadata = {
  title: 'Analyzer Market AI',
  description: 'Análises de mercado local em minutos.'
}

import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="app">
        <div className="bg-orbs" aria-hidden="true" />
        <div className="container">
          <header className="topbar">
            <a className="brand" href="/">
              <span className="brandDot" aria-hidden="true" />
              <span>Analyzer Market AI</span>
            </a>
            <nav className="nav">
              <a className="navLink" href="/terms">Termos</a>
              <a className="navLink" href="/privacy">Privacidade</a>
            </nav>
          </header>

          {children}

          <footer className="footer">
            © {new Date().getFullYear()} Analyzer Market AI — Relatórios gerados por IA (estimativas, sem garantias).
          </footer>
        </div>
      </body>
    </html>
  )
}

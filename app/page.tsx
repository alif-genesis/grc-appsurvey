import { GENESIS_LOGO_URL, withBasePath } from './services';

export default function HomePage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <nav className="landing-nav" aria-label="Navigasi utama">
          <img
            className="landing-logo"
            src={GENESIS_LOGO_URL}
            alt="PT Genetika Solusi Bisnis"
          />
        </nav>

        <div className="landing-content">
          <p className="landing-eyebrow">Survei Kepuasan Layanan</p>
          <h1>Selamat datang di Aplikasi Survey PT. Genetika Solusi Bisnis</h1>
          <p>
            Platform terpadu untuk mengelola survei layanan, mengirimkan survey layanan
            dengan pengisian survei yang mudah dan dalam single-page.
          </p>
          <div className="landing-actions">
            <a className="landing-primary" href={withBasePath('/admin')}>
              Dashboard Admin
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

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
            Platform terpadu untuk mengelola survei layanan, memantau respons,
            dan mengirim undangan pengisian survei secara lebih tertib.
          </p>
          <div className="landing-actions">
            <a className="landing-primary" href={withBasePath('/list')}>
              Pilih Layanan
            </a>
            <a className="landing-secondary" href={withBasePath('/admin')}>
              Admin Dashboard
            </a>
          </div>
        </div>

        <div className="landing-panel" aria-label="Ringkasan aplikasi">
          <div>
            <span>01</span>
            <strong>Pilih layanan</strong>
            <p>Akses daftar layanan survei melalui halaman khusus.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Isi survei</strong>
            <p>Responden mengisi penilaian layanan dan saran perbaikan.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Monitor hasil</strong>
            <p>Admin memantau respons, target, dan riwayat blast.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

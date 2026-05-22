import { serviceToSlug, serviceTypes, withBasePath } from './services';

const getServiceUrl = (service: string) => withBasePath(`/${serviceToSlug(service)}`);

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="survey-header admin-header">
        <div className="brand-block">
          <img
            className="brand-image"
            src="https://genetikasolusibisnis.co.id/wp-content/uploads/2022/09/genetika-1-warna.png"
            alt="Genesis"
          />
          <div className="admin-brand-text">
            <p className="agency">Survei Kepuasan Layanan</p>
            <h1>Pilih Layanan yang Anda Terima</h1>
          </div>
        </div>
      </div>

      <section className="table-card">
        <h2>Daftar Layanan</h2>
        <div className="service-link-list">
          {serviceTypes.map((service, index) => (
            <a key={service} className="service-link-item" href={getServiceUrl(service)}>
              <span className="service-link-number">{index + 1}</span>
              <span className="service-link-content">
                <strong>{service}</strong>
                <small>Isi survei untuk layanan ini</small>
              </span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

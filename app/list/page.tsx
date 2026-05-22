import { serviceToSlug, serviceTypes, withBasePath } from '../services';

const getServiceUrl = (service: string) => withBasePath(`/${serviceToSlug(service)}`);

export default function ServiceListPage() {
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
            <p className="agency">Daftar Link Layanan</p>
            <h1>URL Survei Layanan</h1>
          </div>
        </div>
      </div>

      <div className="admin-link-row">
        <div className="admin-actions">
          <a className="admin-link" href={withBasePath('/')}>Kembali ke Form Survei</a>
          <a className="admin-link" href={withBasePath('/admin')}>Masuk Admin Dashboard</a>
        </div>
      </div>

      <section className="table-card">
        <h2>Daftar URL Layanan</h2>
        <div className="service-link-list">
          {serviceTypes.map((service, index) => {
            const href = getServiceUrl(service);

            return (
              <a key={service} className="service-link-item" href={href}>
                <span className="service-link-number">{index + 1}</span>
                <span className="service-link-content">
                  <strong>{service}</strong>
                  <small>{href}</small>
                </span>
              </a>
            );
          })}
        </div>
      </section>
    </main>
  );
}

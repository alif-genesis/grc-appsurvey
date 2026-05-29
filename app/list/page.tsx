'use client';

import { FormEvent, useEffect, useState } from 'react';
import { serviceToSlug, serviceTypes, withBasePath } from '../services';
import { AdminFooter, AdminHeader } from '../admin/admin-chrome';

type ServiceItem = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

const getServiceUrl = (service: string) => withBasePath(`/${serviceToSlug(service)}?preview=1`);

const fallbackServices = serviceTypes.map((name, index) => ({
  id: `default-${index + 1}`,
  name,
  sortOrder: index + 1,
  active: true,
}));

export default function ServiceListPage() {
  const [services, setServices] = useState<ServiceItem[]>(fallbackServices);
  const [newService, setNewService] = useState('');
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState('');
  const [message, setMessage] = useState('Memuat daftar layanan...');

  const refreshServices = async () => {
    try {
      const response = await fetch(withBasePath('/api/services/?admin=1'), { cache: 'no-store' });
      const payload = await response.json() as { campaignId?: string; services?: ServiceItem[]; warning?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil daftar layanan.');
      setServices(payload.services ?? fallbackServices);
      setMessage(payload.warning || 'Daftar layanan tersinkron dari database.');
    } catch (error) {
      setServices(fallbackServices);
      setMessage(error instanceof Error ? error.message : 'Menggunakan daftar layanan bawaan.');
    }
  };

  useEffect(() => {
    refreshServices();
  }, []);

  const addService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await fetch(withBasePath('/api/services/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newService }),
      });
      const payload = await response.json() as { service?: ServiceItem; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal menambahkan layanan.');
      if (payload.service) setServices((current) => [...current, payload.service as ServiceItem]);
      setNewService('');
      setMessage('Layanan berhasil ditambahkan.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menambahkan layanan.');
    }
  };

  const startEdit = (service: ServiceItem) => {
    setEditingId(service.id);
    setEditDrafts((current) => ({ ...current, [service.id]: service.name }));
  };

  const saveService = async (service: ServiceItem) => {
    try {
      const response = await fetch(withBasePath(`/api/services/${service.id}/`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editDrafts[service.id] }),
      });
      const payload = await response.json() as { service?: ServiceItem; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal menyimpan layanan.');
      if (payload.service) {
        setServices((current) => current.map((item) => (item.id === service.id ? payload.service as ServiceItem : item)));
      }
      setEditingId('');
      setMessage('Layanan berhasil diperbarui.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan layanan.');
    }
  };

  const deleteService = async (service: ServiceItem) => {
    try {
      const response = await fetch(withBasePath(`/api/services/${service.id}/`), { method: 'DELETE' });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal menghapus layanan.');
      setServices((current) => current.filter((item) => item.id !== service.id));
      setMessage('Layanan berhasil dihapus.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menghapus layanan.');
    }
  };

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Survei Kepuasan Layanan"
        title="List Layanan"
        currentPath="/list"
        actions={[
          { href: '/control', label: 'Kelola Survey', secondary: true },
          { href: '/admin', label: 'Monitoring' },
          { href: '/monitoring', label: 'Hasil Survey' },
          { href: '/blasting', label: 'Blasting' },
          { href: '/list', label: 'List Layanan' },
          { href: '/work-units', label: 'Satuan Kerja' },
        ]}
      />

      <section className="table-card">
        <div className="section-heading-row">
          <h2>Daftar Layanan</h2>
          <button type="button" className="text-button" onClick={refreshServices}>Refresh</button>
        </div>
        {message && <p className="admin-data-message">{message}</p>}

        <form className="service-admin-form" onSubmit={addService}>
          <label>
            Tambah Layanan
            <input
              value={newService}
              onChange={(event) => setNewService(event.target.value)}
              placeholder="Nama layanan baru"
              required
            />
          </label>
          <button type="submit" className="download-button">Add Layanan</button>
        </form>

        <div className="service-link-list">
          {services.map((service, index) => {
            const isEditing = editingId === service.id;
            return (
              <div key={service.id} className="service-admin-item">
                <a className="service-link-item" href={getServiceUrl(service.name)}>
                  <span className="service-link-number">{index + 1}</span>
                  <span className="service-link-content">
                    <strong>{service.name}</strong>
                    <small>Isi survei untuk layanan ini</small>
                  </span>
                </a>
                <div className="service-admin-actions">
                  {isEditing ? (
                    <>
                      <input
                        value={editDrafts[service.id] ?? service.name}
                        onChange={(event) => setEditDrafts((current) => ({ ...current, [service.id]: event.target.value }))}
                      />
                      <button type="button" className="text-button" onClick={() => saveService(service)}>Simpan</button>
                      <button type="button" className="text-button danger-button" onClick={() => setEditingId('')}>Batal</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="text-button" onClick={() => startEdit(service)}>Edit</button>
                      <button type="button" className="text-button danger-button" onClick={() => deleteService(service)}>Hapus</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <AdminFooter />
    </main>
  );
}

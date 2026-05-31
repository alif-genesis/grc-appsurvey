'use client';

import { FormEvent, useEffect, useState } from 'react';
import { serviceToSlug, withBasePath } from '../services';
import { AdminFooter, AdminHeader } from '../admin/admin-chrome';

type ServiceItem = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

type ImportService = {
  rowNumber: number;
  name: string;
};

const getServiceUrl = (service: string, campaignId: string) => {
  const params = new URLSearchParams({ preview: '1' });
  if (campaignId) params.set('survey', campaignId);
  return withBasePath(`/${serviceToSlug(service)}?${params.toString()}`);
};

const normalizeColumnName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const getImportValue = (row: Record<string, unknown>, aliases: string[]) => {
  const aliasSet = new Set(aliases.map(normalizeColumnName));
  const match = Object.entries(row).find(([key]) => aliasSet.has(normalizeColumnName(key)));
  return match ? String(match[1] ?? '').trim() : '';
};

const normalizeExcelRows = (rawRows: unknown) => {
  if (!Array.isArray(rawRows)) {
    throw new Error('Format Excel tidak valid.');
  }

  if (rawRows.length === 0) return [];

  if (rawRows.every((row) => row && !Array.isArray(row) && typeof row === 'object')) {
    return rawRows as Record<string, unknown>[];
  }

  if (!rawRows.every(Array.isArray)) {
    throw new Error('Format baris Excel tidak valid.');
  }

  const [headerRow, ...bodyRows] = rawRows as unknown[][];
  const headers = headerRow.map((cell) => String(cell ?? '').trim());
  return bodyRows.map((cells) => headers.reduce<Record<string, unknown>>((acc, header, index) => {
    acc[header || `Kolom ${index + 1}`] = cells[index] ?? '';
    return acc;
  }, {}));
};

export default function ServiceListPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [newService, setNewService] = useState('');
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState('');
  const [message, setMessage] = useState('Memuat daftar layanan...');
  const [campaignId, setCampaignId] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportService[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [deletingServiceIds, setDeletingServiceIds] = useState<string[]>([]);

  const refreshServices = async () => {
    try {
      const response = await fetch(withBasePath('/api/services/?admin=1'), { cache: 'no-store' });
      const payload = await response.json() as { campaignId?: string; services?: ServiceItem[]; warning?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil daftar layanan.');
      setServices(payload.services ?? []);
      setCampaignId(payload.campaignId || '');
      setMessage(payload.warning || 'Daftar layanan tersinkron dari database.');
    } catch (error) {
      setServices([]);
      setMessage(error instanceof Error ? error.message : 'Gagal mengambil daftar layanan.');
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
    if (deletingServiceIds.includes(service.id)) return;
    setDeletingServiceIds((current) => [...current, service.id]);
    try {
      setMessage(`Menghapus layanan "${service.name}"...`);
      const response = await fetch(withBasePath(`/api/services/${service.id}/`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: service.name }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal menghapus layanan.');
      setServices((current) => current.filter((item) => item.id !== service.id));
      setMessage('Layanan berhasil dihapus.');
      await refreshServices();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menghapus layanan.');
    } finally {
      setDeletingServiceIds((current) => current.filter((id) => id !== service.id));
    }
  };

  const handleImportFile = async (file?: File | null) => {
    if (!file) return;

    setImportFileName(file.name);
    setImportMessage('');

    try {
      const { default: readSheet } = await import('read-excel-file/browser');
      const rows = normalizeExcelRows(await readSheet(file));
      const existingNames = new Set(services.map((service) => service.name.trim().toLowerCase()));
      const seenNames = new Set<string>();
      const parsedRows = rows.map((row, index) => {
        const name = getImportValue(row, ['layanan', 'nama layanan', 'namalayanan', 'service']);
        return { rowNumber: index + 2, name };
      }).filter((row) => {
        const key = row.name.trim().toLowerCase();
        if (!key || seenNames.has(key) || existingNames.has(key)) return false;
        seenNames.add(key);
        return true;
      });

      setImportRows(parsedRows);
      setImportMessage(`${parsedRows.length} layanan baru siap diimport dari ${rows.length} baris Excel.`);
    } catch (error) {
      setImportRows([]);
      setImportMessage(error instanceof Error ? error.message : 'File Excel gagal dibaca.');
    }
  };

  const submitImportServices = async () => {
    if (importRows.length === 0) return;

    setIsImporting(true);
    setImportMessage('Mengimport layanan ke Supabase...');

    try {
      const importedServices: ServiceItem[] = [];
      let failedCount = 0;

      for (const row of importRows) {
        const response = await fetch(withBasePath('/api/services/'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: row.name }),
        });
        const payload = await response.json() as { service?: ServiceItem };

        if (response.ok && payload.service) {
          importedServices.push(payload.service);
        } else {
          failedCount += 1;
        }
      }

      setServices((current) => [...current, ...importedServices]);
      setImportRows([]);
      setImportFileName('');
      setImportMessage(`Sukses import ${importedServices.length} layanan${failedCount ? `, ${failedCount} gagal` : ''}.`);
      setMessage(`Import Excel selesai: ${importedServices.length} layanan masuk ke database.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Import Excel gagal diproses.');
    } finally {
      setIsImporting(false);
    }
  };

  const downloadImportTemplate = async () => {
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const rows = [
      { Layanan: 'Nama Layanan 1' },
      { Layanan: 'Nama Layanan 2' },
    ];
    const columns = [
      { header: 'Layanan', width: 80, cell: (row: typeof rows[number]) => ({ value: row.Layanan }) },
    ];

    await writeXlsxFile(rows, { columns }).toFile('template-import-layanan.xlsx');
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
          <div className="section-left-actions">
            <button type="button" className="text-button" onClick={refreshServices}>Refresh</button>
            <h2>Daftar Layanan</h2>
          </div>
          <button type="button" className="text-button" onClick={() => setIsImportOpen(true)}>
            Import Excel
          </button>
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
          {services.length === 0 && (
            <p>Belum ada layanan aktif. Tambahkan layanan manual atau import Excel.</p>
          )}
          {services.map((service, index) => {
            const isEditing = editingId === service.id;
            const isDeleting = deletingServiceIds.includes(service.id);
            return (
              <div key={service.id} className="service-admin-item">
                <div className="service-link-item">
                  <span className="service-link-number">{index + 1}</span>
                  <span className="service-link-content">
                    <strong>{service.name}</strong>
                    <small>Isi survei untuk layanan ini</small>
                  </span>
                </div>
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
                      <a className="text-button" href={getServiceUrl(service.name, campaignId)}>Preview</a>
                      <button
                        type="button"
                        className="text-button danger-button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void deleteService(service);
                        }}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Menghapus...' : 'Hapus'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {isImportOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-service-title">
          <div className="import-modal">
            <div className="section-heading-row">
              <div>
                <p className="agency">List Layanan</p>
                <h2 id="import-service-title">Import Excel</h2>
              </div>
              <button
                type="button"
                className="text-button danger-button"
                onClick={() => setIsImportOpen(false)}
                disabled={isImporting}
              >
                Tutup
              </button>
            </div>

            <div className="import-help">
              <p>Gunakan satu kolom: Layanan.</p>
              <button type="button" className="download-button import-template-button" onClick={downloadImportTemplate}>
                Download Template Excel
              </button>
            </div>

            <label className="import-file-picker">
              Pilih file Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => handleImportFile(event.target.files?.[0])}
                disabled={isImporting}
              />
            </label>

            {importMessage && <p className="blast-notice">{importMessage}</p>}
            {importFileName && <p className="table-plain-text">File: {importFileName}</p>}

            {importRows.length > 0 && (
              <div className="import-preview">
                <div className="section-heading-row">
                  <h3>Preview</h3>
                  <span>{importRows.length} layanan siap masuk tabel</span>
                </div>
                <div className="blast-table-wrapper">
                  <table className="blast-table">
                    <thead>
                      <tr>
                        <th>Baris</th>
                        <th>Layanan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row) => (
                        <tr key={`${row.rowNumber}-${row.name}`}>
                          <td>{row.rowNumber}</td>
                          <td>{row.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importRows.length > 10 && <p className="table-plain-text">Menampilkan 10 data pertama.</p>}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="download-button"
                onClick={submitImportServices}
                disabled={isImporting || importRows.length === 0}
              >
                {isImporting ? 'Mengimport...' : 'Submit Import'}
              </button>
              <button
                type="button"
                className="admin-link secondary-admin-link"
                onClick={() => setIsImportOpen(false)}
                disabled={isImporting}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      <AdminFooter />
    </main>
  );
}

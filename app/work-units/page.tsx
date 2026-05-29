'use client';

import { FormEvent, useEffect, useState } from 'react';
import { defaultWorkUnits } from '../survey-constants';
import { withBasePath } from '../services';
import { AdminFooter, AdminHeader } from '../admin/admin-chrome';

type WorkUnitItem = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

const fallbackWorkUnits = defaultWorkUnits.map((name, index) => ({
  id: `default-work-unit-${index + 1}`,
  name,
  sortOrder: index + 1,
  active: true,
}));

export default function WorkUnitListPage() {
  const [workUnits, setWorkUnits] = useState<WorkUnitItem[]>(fallbackWorkUnits);
  const [newWorkUnit, setNewWorkUnit] = useState('');
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState('');
  const [message, setMessage] = useState('Memuat daftar satuan kerja...');

  const refreshWorkUnits = async () => {
    try {
      const response = await fetch(withBasePath('/api/work-units/'), { cache: 'no-store' });
      const payload = await response.json() as { workUnits?: WorkUnitItem[]; warning?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil daftar satuan kerja.');
      setWorkUnits(payload.workUnits ?? fallbackWorkUnits);
      setMessage(payload.warning || 'Daftar satuan kerja tersinkron dari database.');
    } catch (error) {
      setWorkUnits(fallbackWorkUnits);
      setMessage(error instanceof Error ? error.message : 'Menggunakan daftar satuan kerja bawaan.');
    }
  };

  useEffect(() => {
    refreshWorkUnits();
  }, []);

  const addWorkUnit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await fetch(withBasePath('/api/work-units/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkUnit }),
      });
      const payload = await response.json() as { workUnit?: WorkUnitItem; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal menambahkan satuan kerja.');
      if (payload.workUnit) setWorkUnits((current) => [...current, payload.workUnit as WorkUnitItem]);
      setNewWorkUnit('');
      setMessage('Satuan kerja berhasil ditambahkan.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menambahkan satuan kerja.');
    }
  };

  const startEdit = (workUnit: WorkUnitItem) => {
    setEditingId(workUnit.id);
    setEditDrafts((current) => ({ ...current, [workUnit.id]: workUnit.name }));
  };

  const saveWorkUnit = async (workUnit: WorkUnitItem) => {
    try {
      const response = await fetch(withBasePath(`/api/work-units/${workUnit.id}/`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editDrafts[workUnit.id] }),
      });
      const payload = await response.json() as { workUnit?: WorkUnitItem; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal menyimpan satuan kerja.');
      if (payload.workUnit) {
        setWorkUnits((current) => current.map((item) => (item.id === workUnit.id ? payload.workUnit as WorkUnitItem : item)));
      }
      setEditingId('');
      setMessage('Satuan kerja berhasil diperbarui.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan satuan kerja.');
    }
  };

  const deleteWorkUnit = async (workUnit: WorkUnitItem) => {
    try {
      const response = await fetch(withBasePath(`/api/work-units/${workUnit.id}/`), { method: 'DELETE' });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal menghapus satuan kerja.');
      setWorkUnits((current) => current.filter((item) => item.id !== workUnit.id));
      setMessage('Satuan kerja berhasil dihapus.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menghapus satuan kerja.');
    }
  };

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Survei Kepuasan Layanan"
        title="Satuan Kerja"
        currentPath="/work-units"
      />

      <section className="table-card">
        <div className="section-heading-row">
          <h2>Daftar Satuan Kerja</h2>
          <button type="button" className="text-button" onClick={refreshWorkUnits}>Refresh</button>
        </div>
        {message && <p className="admin-data-message">{message}</p>}

        <form className="service-admin-form" onSubmit={addWorkUnit}>
          <label>
            Tambah Satuan Kerja
            <input
              value={newWorkUnit}
              onChange={(event) => setNewWorkUnit(event.target.value)}
              placeholder="Nama satuan kerja baru"
              required
            />
          </label>
          <button type="submit" className="download-button">Add Satuan Kerja</button>
        </form>

        <div className="service-link-list">
          {workUnits.map((workUnit, index) => {
            const isEditing = editingId === workUnit.id;
            return (
              <div key={workUnit.id} className="service-admin-item">
                <div className="service-link-item work-unit-list-item">
                  <span className="service-link-number">{index + 1}</span>
                  <span className="service-link-content">
                    <strong>{workUnit.name}</strong>
                    <small>Opsi dropdown satuan kerja pada halaman survei</small>
                  </span>
                </div>
                <div className="service-admin-actions">
                  {isEditing ? (
                    <>
                      <input
                        value={editDrafts[workUnit.id] ?? workUnit.name}
                        onChange={(event) => setEditDrafts((current) => ({ ...current, [workUnit.id]: event.target.value }))}
                      />
                      <button type="button" className="text-button" onClick={() => saveWorkUnit(workUnit)}>Simpan</button>
                      <button type="button" className="text-button danger-button" onClick={() => setEditingId('')}>Batal</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="text-button" onClick={() => startEdit(workUnit)}>Edit</button>
                      <button type="button" className="text-button danger-button" onClick={() => deleteWorkUnit(workUnit)}>Hapus</button>
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

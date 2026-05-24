'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminFooter, AdminHeader } from '../admin/admin-chrome';
import { withBasePath } from '../services';

type SurveyCampaign = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  description: string;
  active: boolean;
};

export default function ControlPanelPage() {
  const [campaigns, setCampaigns] = useState<SurveyCampaign[]>([]);
  const [activeId, setActiveId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('Memuat daftar survey...');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<string, { name: string; description: string }>>({});

  const loadCampaigns = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(withBasePath('/api/survey-campaigns'), { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil daftar survey.');
      setCampaigns(payload.campaigns || []);
      setActiveId(payload.activeId || '');
      setMessage(payload.warning || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengambil daftar survey.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const createCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage('Nama survey wajib diisi.');
      return;
    }

    setIsSaving(true);
    setMessage('Menambahkan survey...');
    try {
      const response = await fetch(withBasePath('/api/survey-campaigns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, description: description.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Gagal menambahkan survey.');

      setCampaigns((current) => [...current, payload.campaign]);
      setName('');
      setDescription('');
      setMessage('Survey baru ditambahkan. Klik Kelola untuk mulai mengatur data survey tersebut.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menambahkan survey.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditCampaign = (campaign: SurveyCampaign) => {
    setEditDrafts((current) => ({
      ...current,
      [campaign.id]: {
        name: campaign.name,
        description: campaign.description,
      },
    }));
  };

  const cancelEditCampaign = (id: string) => {
    setEditDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const updateEditDraft = (id: string, field: 'name' | 'description', value: string) => {
    setEditDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  };

  const saveCampaign = async (id: string) => {
    const draft = editDrafts[id];
    if (!draft?.name.trim()) {
      setMessage('Nama survey wajib diisi.');
      return;
    }

    setIsSaving(true);
    setMessage('Menyimpan perubahan survey...');
    try {
      const response = await fetch(withBasePath('/api/survey-campaigns'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: draft.name,
          description: draft.description,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Gagal memperbarui survey.');
      setCampaigns((current) => current.map((campaign) => (
        campaign.id === id ? payload.campaign : campaign
      )));
      cancelEditCampaign(id);
      setMessage('Survey berhasil diperbarui.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memperbarui survey.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCampaign = async (id: string) => {
    setIsSaving(true);
    setMessage('Menghapus survey...');
    try {
      const response = await fetch(withBasePath(`/api/survey-campaigns?id=${encodeURIComponent(id)}`), {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Gagal menghapus survey.');
      setCampaigns((current) => current.filter((campaign) => campaign.id !== id));
      if (activeId === id) setActiveId('');
      setMessage('Survey berhasil dihapus.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menghapus survey.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Admin"
        title="Kelola Survey"
        currentPath="/control"
        homeHref="/control"
      />

      {message && <p className={`admin-data-message ${isLoading || isSaving ? 'is-loading' : ''}`}>{message}</p>}

      <section className="control-grid">
        <form className="control-create-panel" onSubmit={createCampaign}>
          <div>
            <p>Tambah survey</p>
            <h2>Survey Baru</h2>
          </div>
          <label>
            Nama survey
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Contoh: Direktorat A Komdigi"
              maxLength={180}
            />
          </label>
          <label>
            Deskripsi
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Opsional, untuk catatan admin"
              maxLength={500}
            />
          </label>
          <button type="submit" className="primary-submit compact-submit" disabled={isSaving}>
            {isSaving ? 'Menyimpan...' : 'Tambah Survey'}
          </button>
        </form>

        <section className="control-list-panel" aria-live="polite">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">Survey aktif</p>
              <h2>Daftar Survey</h2>
            </div>
          </div>

          <div className="campaign-list">
            {campaigns.map((campaign) => {
              const draft = editDrafts[campaign.id];
              const isEditing = Boolean(draft);
              return (
                <article className="campaign-card" key={campaign.id}>
                  <div className="campaign-main">
                    <div className="campaign-title-row">
                      {isEditing ? (
                        <input
                          className="campaign-edit-input"
                          value={draft.name}
                          onChange={(event) => updateEditDraft(campaign.id, 'name', event.target.value)}
                          maxLength={180}
                        />
                      ) : (
                        <h3>{campaign.name}</h3>
                      )}
                      <span>Aktif</span>
                    </div>
                    {isEditing ? (
                      <textarea
                        className="campaign-edit-textarea"
                        value={draft.description}
                        onChange={(event) => updateEditDraft(campaign.id, 'description', event.target.value)}
                        maxLength={500}
                      />
                    ) : (
                      <p>{campaign.description || 'Belum ada deskripsi.'}</p>
                    )}
                  </div>
                  <div className="campaign-actions">
                    {isEditing ? (
                      <>
                        <button type="button" className="text-button" onClick={() => saveCampaign(campaign.id)} disabled={isSaving}>
                          Simpan
                        </button>
                        <button type="button" className="text-button" onClick={() => cancelEditCampaign(campaign.id)} disabled={isSaving}>
                          Batal
                        </button>
                      </>
                    ) : (
                      <>
                        <a className="admin-link" href={withBasePath(`/api/survey-campaigns/activate?id=${encodeURIComponent(campaign.id)}`)}>
                          Kelola
                        </a>
                        <button type="button" className="text-button" onClick={() => startEditCampaign(campaign)} disabled={isSaving}>
                          Edit
                        </button>
                        <button type="button" className="text-button danger-button" onClick={() => deleteCampaign(campaign.id)} disabled={isSaving}>
                          Hapus
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
            {!campaigns.length && !isLoading && (
              <p className="empty-campaign-state">Belum ada survey. Tambahkan survey pertama dari form di samping.</p>
            )}
          </div>
        </section>
      </section>

      <AdminFooter />
    </main>
  );
}

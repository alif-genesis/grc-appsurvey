'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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

  const activeCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === activeId),
    [campaigns, activeId],
  );

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

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Admin Control Panel"
        title="Kelola Survey"
        currentPath="/control"
        homeHref="/control"
      />

      <section className="control-hero">
        <div>
          <p>Survey aktif</p>
          <h2>{activeCampaign?.name || 'Biro Hubungan Masyarakat'}</h2>
          <span>{activeCampaign?.description || 'Data admin saat ini mengikuti survey aktif yang dipilih di panel ini.'}</span>
        </div>
      </section>

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
              <p className="section-kicker">Survey berjalan</p>
              <h2>Daftar Survey</h2>
            </div>
            <button type="button" className="text-button" onClick={loadCampaigns} disabled={isLoading}>
              Refresh
            </button>
          </div>

          <div className="campaign-list">
            {campaigns.map((campaign) => (
              <article className={`campaign-card ${campaign.id === activeId ? 'is-active' : ''}`} key={campaign.id}>
                <div>
                  <div className="campaign-title-row">
                    <h3>{campaign.name}</h3>
                    {campaign.id === activeId && <span>Aktif</span>}
                  </div>
                  <p>{campaign.description || 'Belum ada deskripsi.'}</p>
                </div>
                <a className="admin-link" href={withBasePath(`/api/survey-campaigns/activate?id=${encodeURIComponent(campaign.id)}`)}>
                  Kelola
                </a>
              </article>
            ))}
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

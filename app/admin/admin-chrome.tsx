import { GENESIS_LOGO_URL, withBasePath } from '../services';

type AdminChromeProps = {
  eyebrow: string;
  title: string;
  currentPath?: string;
  homeHref?: string;
  actions?: Array<{
    href: string;
    label: string;
    secondary?: boolean;
  }>;
};

export function AdminHeader({ eyebrow, title, currentPath = '', homeHref = '/admin', actions = [] }: AdminChromeProps) {
  return (
    <header className="admin-topbar">
      <div className="admin-title-row">
        <a className="admin-brand-mark" href={withBasePath(homeHref)} aria-label="Dashboard Admin">
          <img src={GENESIS_LOGO_URL} alt="Genesis" />
        </a>
        <div>
          <p>{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </div>

      <nav className="admin-nav" aria-label="Navigasi admin">
        {actions.map((action) => (
          <a
            key={action.href}
            className={[
              'admin-link',
              action.secondary ? 'secondary-admin-link' : '',
              action.href === currentPath ? 'active-admin-link' : '',
            ].filter(Boolean).join(' ')}
            href={withBasePath(action.href)}
          >
            {action.label}
          </a>
        ))}
        <a className="admin-link secondary-admin-link" href={withBasePath('/api/logout')}>
          Logout
        </a>
      </nav>
    </header>
  );
}

export function AdminFooter() {
  return (
    <footer className="app-footer">
      © 2026 PT. Genetika Solusi Bisnis
    </footer>
  );
}

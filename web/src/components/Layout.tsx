import { NavLink, Outlet } from 'react-router-dom';
import { Newspaper, BarChart3, Settings, Zap, BookOpen } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Feed', icon: Newspaper },
  { to: '/briefing', label: 'Briefing', icon: BookOpen },
  { to: '/profile', label: 'Profile', icon: BarChart3 },
  { to: '/jobs', label: 'Jobs', icon: Zap },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-surface">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border-light" role="navigation" aria-label="Main navigation">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <h1 className="text-[18px] font-bold text-text-primary tracking-tight">MyHeadlines</h1>
          <div className="flex gap-0.5 items-center mr-12" role="tablist">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                role="tab"
                aria-label={label}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-pill-active-bg text-text-primary'
                      : 'text-text-muted hover:text-text-secondary hover:bg-surface'
                  }`
                }
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-5 py-8" role="main">
        <Outlet />
      </main>
    </div>
  );
}

import type { ReactNode } from 'react';
import { KeyRound } from 'lucide-react';

interface PasswordCardIconProps {
  logoUrl?: string;
  icon?: string;
  alt: string;
  onError?: () => void;
}

export function PasswordCardIcon({ logoUrl, icon, alt, onError }: PasswordCardIconProps) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-700">
      {logoUrl
        ? <img src={logoUrl} alt={alt} className="h-full w-full object-contain" onError={onError} />
        : icon
          ? <span className="text-xl" aria-hidden="true">{icon}</span>
          : <KeyRound className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
    </div>
  );
}

export interface PasswordCardAction {
  key: string;
  label: string;
  title?: string;
  icon: ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

interface PasswordCardActionsProps {
  actions: Array<PasswordCardAction | null>;
}

export function PasswordCardActions({ actions }: PasswordCardActionsProps) {
  return (
    <div className="mt-3 grid w-full min-w-0 grid-cols-4 gap-2 min-[430px]:grid-cols-6">
      {actions.map((action, index) => action
        ? (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title}
            aria-label={action.label}
            className={`box-border flex h-11 w-full min-w-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              action.danger
                ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-950/70 dark:text-red-300 dark:hover:bg-red-900'
                : action.active
                  ? 'bg-emerald-600 text-white dark:bg-emerald-700'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'
            }`}
          >
            {action.icon}
          </button>
        )
        : <span key={`empty-${index}`} className="h-11" aria-hidden="true" />)}
    </div>
  );
}

interface PasswordCardSurfaceProps {
  children: ReactNode;
  manual?: boolean;
}

export function PasswordCardSurface({ children, manual = false }: PasswordCardSurfaceProps) {
  return (
    <article
      data-card-kind={manual ? 'manual' : 'automatic'}
      className={`rounded-2xl border shadow-sm ${
        manual
          ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/70 dark:bg-indigo-950/30'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
      }`}
    >
      {children}
    </article>
  );
}

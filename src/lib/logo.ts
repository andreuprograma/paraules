const KNOWN_LOGO_DOMAINS: Record<string, string> = {
  whatsapp: 'whatsapp.com',
  netflix: 'netflix.com',
  google: 'google.com',
  caixabank: 'caixabank.es',
};

export interface ResolvedLogoInput {
  url: string;
  domain?: string;
}

export function resolveLogoInput(input: string, logoDevToken: string): ResolvedLogoInput {
  let value = input.trim();
  if (!value) {
    throw new Error('Introdueix una marca coneguda, un domini o una URL d’imatge.');
  }

  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('La URL no és vàlida. Introdueix una URL completa que comenci per http:// o https://.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new Error('La URL ha de ser HTTP o HTTPS vàlida.');
    }
    if (url.pathname !== '/' || url.search || url.hash) return { url: url.href };
    value = url.hostname;
  }

  const normalizedBrand = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const knownDomain = KNOWN_LOGO_DOMAINS[normalizedBrand];
  const manualDomain = value
    .replace(/^www\./i, '')
    .split(/[/?#]/, 1)[0]
    .toLowerCase();
  const domain = knownDomain || (manualDomain.includes('.') ? manualDomain : '');

  if (!domain || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error('No tinc un domini conegut per a aquesta marca. Introdueix el seu domini o una URL completa d’imatge.');
  }
  if (!logoDevToken) {
    throw new Error('Falta VITE_LOGODEV_TOKEN a .env. Afegeix-hi el token públic de Logo.dev i reinicia Vite.');
  }

  const params = new URLSearchParams({ token: logoDevToken, size: '128', format: 'png' });
  return {
    url: `https://img.logo.dev/${encodeURIComponent(domain)}?${params.toString()}`,
    domain,
  };
}

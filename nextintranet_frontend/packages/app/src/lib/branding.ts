import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface BrandingSettings {
  company_name: string;
  company_short_name: string;
  theme_color: string;
  background_color: string;
  logo_url?: string | null;
  pwa_icon_192_url?: string | null;
  pwa_icon_512_url?: string | null;
  pwa_icon_maskable_url?: string | null;
  updated_at?: string | null;
}

const DEFAULT_NAME = 'NextIntranet';
const DEFAULT_THEME_COLOR = '#0f172a';

function setMetaTag(selector: string, attribute: string, value: string) {
  const element = document.querySelector<HTMLMetaElement>(selector);
  if (element) {
    element.setAttribute(attribute, value);
  }
}

function setLinkTag(selector: string, href: string) {
  const element = document.querySelector<HTMLLinkElement>(selector);
  if (element) {
    element.href = href;
  }
}

export function applyBrandingMeta(branding: BrandingSettings | null | undefined) {
  if (!branding) return;

  const name = branding.company_name || DEFAULT_NAME;
  const shortName = branding.company_short_name || name;
  const themeColor = branding.theme_color || DEFAULT_THEME_COLOR;

  document.title = name;

  setMetaTag('meta[name="theme-color"]', 'content', themeColor);
  setMetaTag('meta[name="apple-mobile-web-app-title"]', 'content', shortName);
  setMetaTag('meta[name="msapplication-TileColor"]', 'content', themeColor);

  // Cache-bust the manifest so browser picks up new names/colors/icons.
  const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifestLink) {
    const baseUrl = '/api/v1/setting/branding/pwa-manifest.json';
    const cacheBuster = branding.updated_at
      ? `?v=${encodeURIComponent(branding.updated_at)}`
      : '';
    const newHref = `${baseUrl}${cacheBuster}`;
    if (manifestLink.href !== newHref) {
      manifestLink.href = newHref;
    }
  }

  if (branding.pwa_icon_192_url) {
    setLinkTag('link[rel="apple-touch-icon"]', branding.pwa_icon_192_url);
  } else {
    setLinkTag('link[rel="apple-touch-icon"]', '/apple-touch-icon.png');
  }

  // Update mask-icon color to match theme.
  const maskIcon = document.querySelector<HTMLLinkElement>('link[rel="mask-icon"]');
  if (maskIcon) {
    maskIcon.setAttribute('color', themeColor);
  }
}

export function resetBrandingMeta() {
  document.title = DEFAULT_NAME;
  setMetaTag('meta[name="theme-color"]', 'content', DEFAULT_THEME_COLOR);
  setMetaTag('meta[name="apple-mobile-web-app-title"]', 'content', DEFAULT_NAME);
  setMetaTag('meta[name="msapplication-TileColor"]', 'content', DEFAULT_THEME_COLOR);
  setLinkTag('link[rel="apple-touch-icon"]', '/apple-touch-icon.png');
}

// ------------------------------------------------------------------
// PWA manual install prompt
// ------------------------------------------------------------------

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

function notifyInstallableChanged() {
  window.dispatchEvent(
    new CustomEvent('pwa-installable', { detail: { installable: !!deferredInstallPrompt } })
  );
}

export function setInstallPrompt(event: BeforeInstallPromptEvent | null) {
  deferredInstallPrompt = event;
  notifyInstallableChanged();
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredInstallPrompt;
}

function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS standalone mode
    ('standalone' in window.navigator && Boolean(window.navigator.standalone))
  );
}

export interface PwaInstallState {
  isInstallable: boolean;
  isInstalled: boolean;
  isIos: boolean;
  prompt: () => Promise<void>;
}

export function usePwaInstall(): PwaInstallState {
  const [isInstallable, setIsInstallable] = useState(() => !!deferredInstallPrompt);
  const [isInstalled, setIsInstalled] = useState(() => isRunningAsInstalledPwa());

  useEffect(() => {
    const handleInstallable = () => setIsInstallable(!!deferredInstallPrompt && !isRunningAsInstalledPwa());
    const handleInstalled = () => {
      deferredInstallPrompt = null;
      setIsInstallable(false);
      setIsInstalled(true);
    };

    window.addEventListener('pwa-installable', handleInstallable);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const prompt = async () => {
    if (!deferredInstallPrompt) {
      toast.info('Install is not available in this browser.');
      return;
    }
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      toast.success('App installed.');
    } else {
      toast.info('Install dismissed.');
    }
  };

  return {
    isInstallable,
    isInstalled,
    isIos: /iPad|iPhone|iPod/.test(navigator.userAgent),
    prompt,
  };
}
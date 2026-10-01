import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './locales/pt-BR.json';
import en from './locales/en.json';
import es from './locales/es.json';
import zh from './locales/zh.json';

export const SUPPORTED_LOCALES = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
] as const;

export function normalizeLanguage(language: string): (typeof SUPPORTED_LOCALES)[number]['code'] {
  return SUPPORTED_LOCALES.find((locale) => locale.code === language)?.code ?? 'pt-BR';
}

export const i18nReady = i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
    es: { translation: es },
    zh: { translation: zh },
  },
  lng: 'pt-BR',
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LOCALES.map((locale) => locale.code),
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
});

export default i18n;

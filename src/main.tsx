import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import i18n, { i18nReady, normalizeLanguage } from './i18n';
import { DEFAULT_CONFIG, readConfig } from './config/config';
import { isTauri } from './platform/win';
// Fontes embutidas (Fase 9, tarefas 67-68) — empacotadas pelo Vite, sem rede.
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
// Fontes de texto do documento (opções em Configurações → "Fonte do documento").
// `wght.css` = só o eixo de peso; os subconjuntos não-latinos têm `unicode-range`,
// então o navegador nunca baixa (grego/cirílico) para conteúdo PT-BR.
import '@fontsource-variable/literata/wght.css';
import '@fontsource-variable/source-serif-4/wght.css';
// Ícones da UI (tarefa 69) — variante com eixos wght + FILL, embutida.
import '@fontsource-variable/material-symbols-outlined/fill.css';
import './styles/global.css';
import { applyTheme } from './platform/theme';

// Pinta o tema o quanto antes (evita flash); o App corrige com a config salva.
applyTheme('system');

const root = document.getElementById('root');
if (!root) {
  throw new Error('elemento #root nao encontrado no index.html');
}

async function startApp() {
  await i18nReady;
  let config = DEFAULT_CONFIG;
  if (isTauri) {
    try {
      config = await readConfig();
    } catch {
      // O app também pode ser aberto no navegador durante o desenvolvimento.
    }
  }
  config.language = normalizeLanguage(config.language);
  await i18n.changeLanguage(config.language);
  ReactDOM.createRoot(root!).render(
    <React.StrictMode>
      <App initialConfig={config} />
    </React.StrictMode>,
  );
}

void startApp();

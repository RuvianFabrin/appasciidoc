# AppAsciiDoc

## Documentação organizada, sem peso desnecessário

Escreva documentação técnica, manuais, procedimentos, guias de estudo e notas
de projeto em AsciiDoc. O AppAsciiDoc combina edição inline e pré-visualização
ao vivo para você acompanhar o resultado enquanto escreve. Organize notas em
pastas ligadas entre si e exporte documentos como HTML, PDF ou site estático.

O conteúdo fica no seu computador. O app funciona offline, não exige conta e
foi feito para ser enxuto: o instalador NSIS atual tem cerca de 3,9 MB. O uso
de memória ainda não foi medido.

## Sincronização e criptografia

O Git é opcional. Abrir ou visualizar uma pasta não cria um repositório. Depois
de configurar o remoto nas preferências, um clique em **Sincronizar Git** faz o
primeiro `git init` quando necessário, registra as mudanças com uma mensagem
padrão e executa fetch, merge e push. O app tenta combinar alterações
automaticamente; quando preserva versões em conflito, elas ficam em
`.appasciidoc/conflitos/` e seguem junto no sync.

Também é possível proteger uma nota com AGE e uma senha. O arquivo `.age` pode
ser sincronizado e aberto em outro dispositivo AppAsciiDoc com a mesma senha.
Ao descriptografar, o app mantém o `.age` para sincronização e ignora a cópia em
texto puro no Git daquele clone.

## Sistemas compatíveis

| Sistema | Versão / requisito |
| --- | --- |
| Windows | Windows 10 versão 1803 ou posterior, ou Windows 11, 64 bits. Requer o Microsoft Edge WebView2 Runtime. |
| Linux | Distribuição 64 bits com GTK 3 e WebKitGTK 4.1. Ubuntu 22.04+ e Debian 12+ são referências de base; outras distribuições precisam fornecer essas bibliotecas. |
| macOS | macOS Catalina 10.15 ou posterior. O build configurado é universal para Macs Intel e Apple Silicon. |

Essas são as versões mínimas previstas pela configuração e pelos requisitos
do Tauri. O workflow gera builds para os três sistemas; a execução em cada
versão mínima ainda precisa de teste em máquinas reais.

## Instalar e executar no Linux

No Debian ou Ubuntu, o pacote `.deb` instala as dependências declaradas pelo
instalador. Para usar um AppImage, confirme que o sistema tem os runtimes do
WebKitGTK 4.1 e GTK 3:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0
```

Em Fedora, Arch e outras distribuições, instale os pacotes equivalentes de
WebKitGTK 4.1 e GTK 3. O nome dos pacotes varia conforme a distribuição.

## Compilar a partir do código

Pré-requisitos comuns: Node.js 20+, npm e Rust stable via `rustup`.

### Dependências para compilar no Linux

No Debian ou Ubuntu:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libgtk-3-dev libdbus-1-dev patchelf
```

### Dependências para compilar no Windows

- Visual Studio Build Tools com **Desenvolvimento para desktop com C++**.
- Microsoft Edge WebView2 Runtime.
- Rust com a toolchain MSVC (`rustup default stable-msvc`).

### Dependências para compilar no macOS

- Xcode Command Line Tools (`xcode-select --install`).
- Rust stable. Para gerar o instalador universal, instale os alvos Intel e
  Apple Silicon:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
```

### Comandos

```bash
npm ci
npm run tauri dev
```

Para gerar os instaladores na plataforma atual:

```bash
npm run tauri build
```

No macOS, para gerar o `.dmg` universal:

```bash
MACOSX_DEPLOYMENT_TARGET=10.15 npm run tauri build -- --target universal-apple-darwin
```

No Windows, os instaladores NSIS (`.exe`) e MSI ficam em
`src-tauri/target/release/bundle/`. No Linux, procure `.deb` e `.AppImage`; no
macOS, o `.dmg` universal fica em `src-tauri/target/universal-apple-darwin/`.

## Verificações

```bash
npm run check
```

O GitHub Actions também compila para Windows, Linux e macOS e publica os
instaladores como artefatos de build.

## Tecnologias

- Tauri 2
- React e TypeScript
- Asciidoctor.js
- Rust

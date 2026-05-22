/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_DOCS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

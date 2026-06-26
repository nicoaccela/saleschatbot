/// <reference types="vite/client" />

// Vite provides ambient module declarations for static asset imports
// (`*.svg`, `*.png`, `*.css?inline`, etc.) via `vite/client`. Without this
// reference, `tsc --noEmit` cannot resolve the logo `*.svg` imports in the
// components and the release Typecheck gate fails before the installer builds.

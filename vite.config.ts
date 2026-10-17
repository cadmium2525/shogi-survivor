import { defineConfig } from 'vite';

// Relative assets also work under https://name.github.io/repository-name/.
export default defineConfig({ base: './', build: { target: 'es2022' } });

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { rolldownOptions: { input: { main: 'index.html', film: 'film.html', layered: 'layered.html', fight: 'fight.html' } } },
});

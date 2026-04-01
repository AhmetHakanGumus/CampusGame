import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    plugins: [basicSsl()],
    build: {
        outDir: 'dist',
        emptyOutDir: true
    },
    server: {
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true
            },
            '/socket.io': {
                target: 'http://localhost:4000',
                ws: true,
                changeOrigin: true
            }
        }
    },
    preview: {
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true
            },
            '/socket.io': {
                target: 'http://localhost:4000',
                ws: true,
                changeOrigin: true
            }
        }
    }
});

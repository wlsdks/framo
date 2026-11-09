import { defineConfig } from 'vite'

// 로컬 서버, MCP 서버, 시작 프로그램(launch)을 Node에서 바로 도는 파일 하나씩으로 묶는다. 받는 사람이 npm install을 하지 않아도 되게.
export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist-node',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      input: { serve: 'server/serve.ts', 'gyeol-mcp': 'mcp/server.ts', launch: 'server/launch.ts' },
      output: { entryFileNames: '[name].mjs', chunkFileNames: 'shared-[hash].mjs', format: 'es' },
    },
  },
  ssr: { noExternal: true, target: 'node' },
})

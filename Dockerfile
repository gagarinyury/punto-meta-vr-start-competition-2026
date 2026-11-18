# The published Punto (DEPLOY.md): one Cloud Run service serves the built page and /api.
# The coder runs inside it (tools/coder.mjs: Vertex, then `tsc` over src/), so the image keeps the
# sources, the knowledge, the samples and the dev dependencies (typescript, the IWSDK types).
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
# @iwsdk/reference is the IWSDK docs index for the coding agents' MCP tools; with its ML runtime (onnxruntime,
# transformers) it is ~380 MB that nothing in the image uses (audit item 28: node_modules 765 -> 385 MB; the
# build, tsc for the coder and the server checked without it, 15.11).
# ONNXRUNTIME_NODE_INSTALL_CUDA=skip: onnxruntime-node (a dependency of @iwsdk/reference, removed in the same step)
# downloads CUDA binaries when installed, and that download answered 404 on 18.11 — the whole build failed on it.
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --no-audit --no-fund && npm uninstall --no-save --no-audit --no-fund @iwsdk/reference
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

COPY . .
# `src/features/made-*` are kept out by .dockerignore: whatever is there at build time is baked into the page
# The bare coder's things are shown as their code built them (18.11, VITE_NO_STYLEGUARD in src/live.ts: the guard cut
# smooth molecules into facets). The intro stays: a judge is a new player.
RUN VITE_NO_STYLEGUARD=1 npx vite build

ENV PUNTO_PUBLISHED=1 NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server/index.mjs"]

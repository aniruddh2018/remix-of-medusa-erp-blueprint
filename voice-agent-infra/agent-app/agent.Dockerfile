# Simplified from the reference implementation's Dockerfile — no Python/uv
# stage, since this app has no MCP server support (all tools call Supabase
# directly, no external MCP processes to spawn).
FROM public.ecr.aws/lambda/nodejs:22 AS builder
WORKDIR /build
COPY package*.json ./
RUN npm install
COPY . .
RUN npx esbuild src/agent-core.ts --bundle --outdir=dist --platform=node --charset=utf8 --format=esm --out-extension:.js=.mjs

FROM public.ecr.aws/lambda/nodejs:22 AS runner
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /build/dist/. ./

ENTRYPOINT ["node"]
CMD ["agent-core.mjs"]

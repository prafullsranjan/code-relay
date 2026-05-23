FROM node:20-alpine
WORKDIR /app
COPY . .
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @coderelay/collab build
CMD ["pnpm", "--filter", "@coderelay/collab", "start"]

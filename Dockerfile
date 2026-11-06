# One image for the prober and the survey. CHAINKIV_ARGS picks the command; keys come from the environment.
FROM oven/bun:1.3.14
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
CMD ["sh", "-c", "export PROBER_REGION=\"railway-${RAILWAY_REPLICA_REGION:-unknown}\"; exec bun run --conditions browser src/cli.ts $CHAINKIV_ARGS"]

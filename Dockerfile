FROM oven/bun:1-alpine

# Install security updates
RUN apk --no-cache upgrade

# Create non-root user for sandbox with no login shell
RUN adduser -D -s /sbin/nologin -h /sandbox sandbox

# Create working directories with proper permissions
WORKDIR /sandbox
RUN mkdir -p /sandbox/code /sandbox/proxy /sandbox/sandbox /sandbox/types && \
    chown -R sandbox:sandbox /sandbox

# Copy application files
COPY --chown=sandbox:sandbox src/proxy /sandbox/proxy
COPY --chown=sandbox:sandbox src/sandbox /sandbox/sandbox
COPY --chown=sandbox:sandbox src/types /sandbox/types

# Copy package files and install dependencies
COPY --chown=sandbox:sandbox package.json ./
RUN bun install --production --frozen-lockfile && \
    rm -rf /root/.bun/install/cache

# Remove unnecessary files and tools to minimize attack surface
RUN apk del apk-tools && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Switch to non-root user
USER sandbox

# Expose proxy ports
EXPOSE 9998 9999

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:9999/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the proxy server
CMD ["bun", "run", "/sandbox/proxy/server.ts"]

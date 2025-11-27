# Docker Sandbox Configuration

This directory contains Docker configuration for running the Bun sandbox in an isolated, secure container environment.

## Files

- `Dockerfile` - Container image definition with security hardening
- `docker-compose.yml` - Docker Compose configuration for easy deployment
- `.dockerignore` - Excludes unnecessary files from the build context
- `seccomp-profile.json` - Custom seccomp profile for syscall filtering
- `scripts/run-sandbox.sh` - Helper script for running code in the sandbox

## Security Features

The sandbox container implements multiple layers of security:

### Container Hardening

1. **Non-root User**: All code runs as the `sandbox` user with no privileges
2. **Read-only Filesystem**: Root filesystem is mounted read-only
3. **No Capabilities**: All Linux capabilities are dropped
4. **Resource Limits**:
   - 256MB RAM limit (no swap)
   - 0.5 CPU cores
   - 50 process limit
5. **Restricted Tmpfs**: Temporary filesystems with `noexec`, `nosuid`, `nodev`

### Network Security

- Ports bound to localhost only (127.0.0.1)
- Isolated bridge network
- No internet access by default (can be added if needed)

### Syscall Filtering

- Custom seccomp profile restricts available system calls
- Prevents privilege escalation and dangerous operations

## Quick Start

### Build and Start

```bash
# Build and start the container
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Using the Helper Script

The `run-sandbox.sh` script provides a convenient interface:

```bash
# Run inline code
./scripts/run-sandbox.sh "console.log('Hello, World!')"

# Run code from a file
./scripts/run-sandbox.sh -f script.ts

# Start container in background
./scripts/run-sandbox.sh -d

# Stop container
./scripts/run-sandbox.sh -s

# View logs
./scripts/run-sandbox.sh -l

# Restart container
./scripts/run-sandbox.sh -r
```

## Manual Usage

### Build the Image

```bash
docker build -t bun-sandbox .
```

### Run the Container

```bash
docker run -d \
  --name bun-sandbox \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --security-opt=seccomp=seccomp-profile.json \
  -m 256m \
  --cpus=0.5 \
  --pids-limit=50 \
  -p 127.0.0.1:9998:9998 \
  -p 127.0.0.1:9999:9999 \
  --tmpfs /tmp:size=64M,mode=1777,noexec,nosuid,nodev \
  --tmpfs /sandbox/code:size=32M,mode=0755,noexec,nosuid,nodev \
  bun-sandbox
```

### Execute Code

```bash
# Send code to the proxy server
curl -X POST http://localhost:9998/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "console.log(\"Hello from sandbox!\")"}'
```

## Advanced Configuration

### Custom Seccomp Profile

To use the custom seccomp profile, update `docker-compose.yml`:

```yaml
security_opt:
  - no-new-privileges:true
  - seccomp=seccomp-profile.json
```

### Network Isolation

To completely isolate the container from the network:

```yaml
networks:
  - none
```

### Additional Resource Limits

```yaml
ulimits:
  nproc: 50
  nofile:
    soft: 1024
    hard: 2048
  fsize: 104857600  # 100MB max file size
```

### Environment Variables

Set environment variables for the sandbox:

```yaml
environment:
  - NODE_ENV=production
  - MAX_EXECUTION_TIME=5000
  - MAX_MEMORY=128m
```

## Monitoring

### Health Checks

The container includes a health check endpoint:

```bash
curl http://localhost:9999/health
```

### Container Stats

```bash
# Real-time stats
docker stats bun-sandbox

# Resource usage
docker inspect bun-sandbox | jq '.[0].HostConfig.Memory'
```

### Logs

```bash
# Follow logs
docker logs -f bun-sandbox

# Last 100 lines
docker logs --tail 100 bun-sandbox
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs bun-sandbox

# Inspect container
docker inspect bun-sandbox

# Check if ports are in use
lsof -i :9998
lsof -i :9999
```

### Permission Errors

Ensure files are owned by the `sandbox` user in the container:

```dockerfile
COPY --chown=sandbox:sandbox src/ /sandbox/
```

### Out of Memory

Increase memory limit in `docker-compose.yml`:

```yaml
mem_limit: 512m
```

### Seccomp Errors

If the seccomp profile is too restrictive:

```yaml
security_opt:
  - no-new-privileges:true
  - seccomp:unconfined  # Less secure, but may be needed
```

## Production Considerations

1. **Secrets Management**: Never include secrets in the image. Use Docker secrets or environment variables.

2. **Logging**: Configure log rotation and centralized logging:
   ```yaml
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"
   ```

3. **Updates**: Regularly rebuild the image to include security updates:
   ```bash
   docker compose build --no-cache
   docker compose up -d
   ```

4. **Monitoring**: Integrate with monitoring tools (Prometheus, Datadog, etc.)

5. **Backup**: Regularly backup any persistent data (if added)

6. **Network**: Use a reverse proxy (nginx, Traefik) for production deployments

## Security Best Practices

1. **Regular Updates**: Keep the base image (`oven/bun`) updated
2. **Scan Images**: Use `docker scan` or Trivy to scan for vulnerabilities
3. **Minimal Image**: Keep the image as small as possible
4. **No Secrets**: Never hardcode secrets or credentials
5. **Audit Logs**: Enable and monitor container audit logs
6. **Network Policies**: Use Kubernetes NetworkPolicies or Docker network policies
7. **Runtime Security**: Consider using Falco or similar runtime security tools

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Bun Docker Documentation](https://bun.sh/docs/install/docker)
- [Seccomp Profiles](https://docs.docker.com/engine/security/seccomp/)
- [Linux Capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)

# Docker Sandbox Configuration - Summary

Complete Docker configuration for the Bun sandbox with maximum security hardening.

## Files Created

### Core Docker Files
1. **Dockerfile** (1.2KB)
   - Multi-stage build with Alpine base
   - Non-root user (sandbox)
   - Security hardening included
   - Health check configured

2. **docker-compose.yml** (1.6KB)
   - Complete service definition
   - Resource limits configured
   - Security options enabled
   - Isolated network setup

3. **.dockerignore** (882B)
   - Excludes unnecessary files from build
   - Reduces image size
   - Prevents secret leakage

### Helper Scripts & Tools
4. **scripts/run-sandbox.sh** (5.6KB, executable)
   - CLI tool for running code
   - Automatic container management
   - Error handling
   - Multiple execution modes

5. **Makefile** (5.5KB)
   - 30+ convenience commands
   - Development workflows
   - Security checks
   - Production deployment

### Security Configuration
6. **seccomp-profile.json** (4.6KB)
   - Custom syscall filtering
   - Restricts dangerous operations
   - 150+ allowed syscalls defined

### Documentation
7. **DOCKER.md** (5.7KB)
   - Complete usage guide
   - Security features explained
   - Troubleshooting section
   - Production best practices

8. **.docker-quick-start.md** (0.9KB)
   - Quick reference card
   - Common commands
   - Troubleshooting tips

9. **.env.example** (0.7KB)
   - Environment variable template
   - Configuration documentation

### CI/CD
10. **.github/workflows/docker.yml** (7.9KB)
    - Automated builds
    - Security scanning (Trivy)
    - Integration tests
    - SBOM generation

## Security Features Implemented

### Container Hardening
- ✓ Non-root user (sandbox)
- ✓ Read-only root filesystem
- ✓ All Linux capabilities dropped (CAP_DROP=ALL)
- ✓ No new privileges (security-opt)
- ✓ Custom seccomp profile
- ✓ Restricted tmpfs mounts (noexec, nosuid, nodev)

### Resource Limits
- ✓ Memory: 256MB (no swap)
- ✓ CPU: 0.5 cores
- ✓ PIDs: 50 processes max
- ✓ Tmpfs: 64MB /tmp + 32MB /sandbox/code

### Network Security
- ✓ Ports bound to localhost only (127.0.0.1)
- ✓ Isolated bridge network
- ✓ No unnecessary network access

### Image Security
- ✓ Minimal Alpine base image
- ✓ Security updates installed
- ✓ Package manager removed after install
- ✓ Cache directories cleaned
- ✓ Production dependencies only

## Quick Start

### Option 1: Using Makefile (Recommended)
```bash
# Build and start
make dev

# Run test
make test

# View logs
make logs

# Stop
make down
```

### Option 2: Using Helper Script
```bash
# Start and run code
./scripts/run-sandbox.sh "console.log('Hello!')"

# From file
./scripts/run-sandbox.sh -f script.ts

# Manage container
./scripts/run-sandbox.sh -d  # Start
./scripts/run-sandbox.sh -s  # Stop
./scripts/run-sandbox.sh -l  # Logs
```

### Option 3: Using Docker Compose
```bash
# Start
docker compose up -d

# Stop
docker compose down

# Logs
docker compose logs -f
```

## Testing the Setup

```bash
# 1. Build the image
make build

# 2. Start the container
make up

# 3. Run a test
make test

# 4. Check security settings
make security-check

# 5. View logs
make logs-tail

# 6. Stop
make down
```

## Architecture

```
┌─────────────────────────────────────────────┐
│            Host System (macOS)              │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │   Docker Container (bun-sandbox)      │ │
│  │   ┌───────────────────────────────┐   │ │
│  │   │  User: sandbox (non-root)     │   │ │
│  │   │  Filesystem: read-only        │   │ │
│  │   │  Caps: NONE                   │   │ │
│  │   │  ┌─────────────────────────┐  │   │ │
│  │   │  │  Proxy Server :9998     │  │   │ │
│  │   │  │  Control Server :9999   │  │   │ │
│  │   │  │  ┌───────────────────┐  │  │   │ │
│  │   │  │  │  Code Execution   │  │  │   │ │
│  │   │  │  │  in /sandbox/code │  │  │   │ │
│  │   │  │  └───────────────────┘  │  │   │ │
│  │   │  └─────────────────────────┘  │   │ │
│  │   └───────────────────────────────┘   │ │
│  └───────────────────────────────────────┘ │
│         ↑                          ↑        │
│    localhost:9998          localhost:9999   │
└─────────────────────────────────────────────┘
```

## Security Layers

1. **Container Isolation**: Docker namespace isolation
2. **User Isolation**: Non-root sandbox user
3. **Filesystem Protection**: Read-only root + restricted tmpfs
4. **Capability Dropping**: No Linux capabilities
5. **Syscall Filtering**: Custom seccomp profile
6. **Resource Limits**: Memory, CPU, PID limits
7. **Network Isolation**: Localhost-only binding
8. **Image Hardening**: Minimal base, no tools

## Common Tasks

### Development
```bash
make dev              # Build and start for development
make watch            # Watch logs in real-time
make shell            # Open shell in container
make restart          # Restart container
```

### Testing
```bash
make test             # Run test code
make test-error       # Test error handling
make health           # Check health
make stats            # View resource usage
```

### Production
```bash
make prod-build       # Build for production
make prod-up          # Deploy to production
make security-check   # Run security audit
make scan             # Scan for vulnerabilities
```

### Maintenance
```bash
make clean            # Remove everything
make prune            # Clean unused resources
make pull             # Update base image
make build-no-cache   # Rebuild from scratch
```

## Integration with MCP Server

The sandbox integrates with the MCP server through:

1. **Proxy Server** (port 9998): Receives code execution requests
2. **Control Server** (port 9999): Health checks and management
3. **Isolated Execution**: Code runs in /sandbox/code tmpfs

## Next Steps

1. Review DOCKER.md for detailed documentation
2. Run `make dev` to start development
3. Test with `make test`
4. Check `.docker-quick-start.md` for quick reference
5. Review GitHub Actions workflow for CI/CD

## Troubleshooting

See DOCKER.md for comprehensive troubleshooting guide, or:

```bash
make help             # Show all available commands
make info             # Show container info
docker logs bun-sandbox  # View container logs
```

## Resources

- Full documentation: DOCKER.md
- Quick reference: .docker-quick-start.md
- Helper script: scripts/run-sandbox.sh
- Environment config: .env.example
- CI/CD: .github/workflows/docker.yml

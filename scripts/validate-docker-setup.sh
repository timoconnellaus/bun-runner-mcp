#!/bin/bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Docker Sandbox Validation Script    ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Validation counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"
echo ""

if command -v docker &> /dev/null; then
    pass "Docker is installed"
    docker --version | sed 's/^/  /'
else
    fail "Docker is not installed"
fi

if docker info &> /dev/null; then
    pass "Docker daemon is running"
else
    fail "Docker daemon is not running"
fi

if command -v docker compose &> /dev/null; then
    pass "Docker Compose is available"
else
    fail "Docker Compose is not available"
fi

if command -v make &> /dev/null; then
    pass "Make is installed"
else
    warn "Make is not installed (optional but recommended)"
fi

if command -v jq &> /dev/null; then
    pass "jq is installed"
else
    warn "jq is not installed (required for run-sandbox.sh)"
fi

if command -v curl &> /dev/null; then
    pass "curl is installed"
else
    fail "curl is not installed (required for API calls)"
fi

echo ""

# Check file structure
echo -e "${YELLOW}Checking file structure...${NC}"
echo ""

FILES=(
    "Dockerfile"
    "docker-compose.yml"
    ".dockerignore"
    "seccomp-profile.json"
    "Makefile"
    "scripts/run-sandbox.sh"
    "DOCKER.md"
    ".env.example"
)

for file in "${FILES[@]}"; do
    if [ -f "/Users/tim/repos/bun-runner-mcp/$file" ]; then
        pass "$file exists"
    else
        fail "$file is missing"
    fi
done

# Check script permissions
if [ -x "/Users/tim/repos/bun-runner-mcp/scripts/run-sandbox.sh" ]; then
    pass "run-sandbox.sh is executable"
else
    fail "run-sandbox.sh is not executable"
fi

echo ""

# Validate file contents
echo -e "${YELLOW}Validating file contents...${NC}"
echo ""

# Check Dockerfile
if grep -q "FROM oven/bun" /Users/tim/repos/bun-runner-mcp/Dockerfile; then
    pass "Dockerfile uses Bun base image"
else
    fail "Dockerfile missing Bun base image"
fi

if grep -q "USER sandbox" /Users/tim/repos/bun-runner-mcp/Dockerfile; then
    pass "Dockerfile switches to non-root user"
else
    fail "Dockerfile doesn't switch to non-root user"
fi

# Check docker-compose.yml
if grep -q "read_only: true" /Users/tim/repos/bun-runner-mcp/docker-compose.yml; then
    pass "docker-compose.yml has read-only filesystem"
else
    fail "docker-compose.yml missing read-only filesystem"
fi

if grep -q "cap_drop:" /Users/tim/repos/bun-runner-mcp/docker-compose.yml; then
    pass "docker-compose.yml drops capabilities"
else
    fail "docker-compose.yml doesn't drop capabilities"
fi

if grep -q "mem_limit:" /Users/tim/repos/bun-runner-mcp/docker-compose.yml; then
    pass "docker-compose.yml has memory limits"
else
    fail "docker-compose.yml missing memory limits"
fi

# Check seccomp profile
if jq empty /Users/tim/repos/bun-runner-mcp/seccomp-profile.json 2>/dev/null; then
    pass "seccomp-profile.json is valid JSON"
else
    fail "seccomp-profile.json is invalid JSON"
fi

# Check for hardcoded secrets
if grep -riE "(password|secret|key|token).*=" /Users/tim/repos/bun-runner-mcp/Dockerfile /Users/tim/repos/bun-runner-mcp/docker-compose.yml 2>/dev/null | grep -v "GITHUB_TOKEN" | grep -v "example"; then
    warn "Potential hardcoded secrets found in Docker files"
else
    pass "No hardcoded secrets found"
fi

echo ""

# Check source files
echo -e "${YELLOW}Checking source files...${NC}"
echo ""

if [ -d "/Users/tim/repos/bun-runner-mcp/src/proxy" ]; then
    pass "Proxy source directory exists"
else
    fail "Proxy source directory missing"
fi

if [ -d "/Users/tim/repos/bun-runner-mcp/src/sandbox" ]; then
    pass "Sandbox source directory exists"
else
    fail "Sandbox source directory missing"
fi

if [ -d "/Users/tim/repos/bun-runner-mcp/src/types" ]; then
    pass "Types source directory exists"
else
    fail "Types source directory missing"
fi

echo ""

# Test Docker configuration
echo -e "${YELLOW}Testing Docker configuration...${NC}"
echo ""

if docker compose -f /Users/tim/repos/bun-runner-mcp/docker-compose.yml config > /dev/null 2>&1; then
    pass "docker-compose.yml is valid"
else
    fail "docker-compose.yml has syntax errors"
fi

# Check port availability
if lsof -i :9998 > /dev/null 2>&1; then
    warn "Port 9998 is already in use"
else
    pass "Port 9998 is available"
fi

if lsof -i :9999 > /dev/null 2>&1; then
    warn "Port 9999 is already in use"
else
    pass "Port 9999 is available"
fi

echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}           Validation Summary           ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${RED}Failed:${NC}   $FAILED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All critical checks passed!${NC}"
    echo ""
    echo -e "Next steps:"
    echo -e "  1. Run ${YELLOW}make build${NC} to build the Docker image"
    echo -e "  2. Run ${YELLOW}make up${NC} to start the container"
    echo -e "  3. Run ${YELLOW}make test${NC} to test code execution"
    echo -e "  4. Run ${YELLOW}make security-check${NC} to verify security settings"
    echo ""
    exit 0
else
    echo -e "${RED}Some checks failed. Please fix the issues above.${NC}"
    echo ""
    exit 1
fi

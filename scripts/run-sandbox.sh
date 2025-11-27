#!/bin/bash
set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="bun-sandbox"
PROXY_PORT=9998
CONTROL_PORT=9999
TIMEOUT=10

# Usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS] CODE

Run JavaScript/TypeScript code in the Bun sandbox container.

OPTIONS:
    -h, --help              Show this help message
    -t, --timeout SECONDS   Execution timeout (default: 10)
    -f, --file FILE         Run code from file instead of argument
    -d, --detach            Start container in detached mode only
    -s, --stop              Stop the sandbox container
    -l, --logs              Show container logs
    -r, --restart           Restart the container

EXAMPLES:
    # Run inline code
    $0 "console.log('Hello, World!')"

    # Run code from file
    $0 -f script.ts

    # Start container in background
    $0 -d

    # Stop container
    $0 -s

    # View logs
    $0 -l
EOF
    exit 0
}

# Check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}Error: Docker is not running${NC}" >&2
        exit 1
    fi
}

# Check if container is running
is_running() {
    docker ps --filter "name=${CONTAINER_NAME}" --filter "status=running" --format '{{.Names}}' | grep -q "${CONTAINER_NAME}"
}

# Start the sandbox container
start_container() {
    echo -e "${YELLOW}Starting sandbox container...${NC}"

    if is_running; then
        echo -e "${GREEN}Container is already running${NC}"
        return 0
    fi

    # Check if container exists but is stopped
    if docker ps -a --filter "name=${CONTAINER_NAME}" --format '{{.Names}}' | grep -q "${CONTAINER_NAME}"; then
        echo "Starting existing container..."
        docker start "${CONTAINER_NAME}" >/dev/null
    else
        echo "Creating new container..."
        docker compose up -d
    fi

    # Wait for container to be healthy
    echo "Waiting for container to be ready..."
    local max_wait=30
    local count=0
    while [ $count -lt $max_wait ]; do
        if docker exec "${CONTAINER_NAME}" wget --quiet --tries=1 --spider http://localhost:${CONTROL_PORT}/health 2>/dev/null; then
            echo -e "${GREEN}Container is ready${NC}"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done

    echo -e "${RED}Error: Container failed to become ready${NC}" >&2
    docker logs "${CONTAINER_NAME}"
    exit 1
}

# Stop the sandbox container
stop_container() {
    echo -e "${YELLOW}Stopping sandbox container...${NC}"
    if is_running; then
        docker stop "${CONTAINER_NAME}" >/dev/null
        echo -e "${GREEN}Container stopped${NC}"
    else
        echo "Container is not running"
    fi
}

# Restart the container
restart_container() {
    stop_container
    start_container
}

# Show container logs
show_logs() {
    if docker ps -a --filter "name=${CONTAINER_NAME}" --format '{{.Names}}' | grep -q "${CONTAINER_NAME}"; then
        docker logs -f "${CONTAINER_NAME}"
    else
        echo -e "${RED}Error: Container does not exist${NC}" >&2
        exit 1
    fi
}

# Run code in the sandbox
run_code() {
    local code="$1"

    # Ensure container is running
    start_container

    # Escape code for JSON
    local escaped_code=$(echo -n "$code" | jq -Rs .)

    # Send code to proxy server
    echo -e "${YELLOW}Executing code...${NC}"
    local response=$(curl -s -w "\n%{http_code}" \
        --max-time "$TIMEOUT" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"code\": $escaped_code}" \
        "http://localhost:${PROXY_PORT}/execute")

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)

    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}Output:${NC}"
        echo "$body" | jq -r '.output // .error // .'

        # Check if there was an error in the response
        if echo "$body" | jq -e '.error' >/dev/null 2>&1; then
            return 1
        fi
        return 0
    else
        echo -e "${RED}Error (HTTP $http_code):${NC}" >&2
        echo "$body" | jq -r '.' 2>/dev/null || echo "$body"
        return 1
    fi
}

# Parse arguments
CODE=""
FROM_FILE=false
DETACH_ONLY=false
STOP_ONLY=false
LOGS_ONLY=false
RESTART_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -f|--file)
            FROM_FILE=true
            CODE="$2"
            shift 2
            ;;
        -d|--detach)
            DETACH_ONLY=true
            shift
            ;;
        -s|--stop)
            STOP_ONLY=true
            shift
            ;;
        -l|--logs)
            LOGS_ONLY=true
            shift
            ;;
        -r|--restart)
            RESTART_ONLY=true
            shift
            ;;
        -*)
            echo -e "${RED}Error: Unknown option $1${NC}" >&2
            usage
            ;;
        *)
            CODE="$1"
            shift
            ;;
    esac
done

# Main execution
check_docker

if [ "$STOP_ONLY" = true ]; then
    stop_container
    exit 0
fi

if [ "$LOGS_ONLY" = true ]; then
    show_logs
    exit 0
fi

if [ "$RESTART_ONLY" = true ]; then
    restart_container
    exit 0
fi

if [ "$DETACH_ONLY" = true ]; then
    start_container
    exit 0
fi

# Validate code input
if [ -z "$CODE" ]; then
    echo -e "${RED}Error: No code provided${NC}" >&2
    usage
fi

# Read code from file if specified
if [ "$FROM_FILE" = true ]; then
    if [ ! -f "$CODE" ]; then
        echo -e "${RED}Error: File not found: $CODE${NC}" >&2
        exit 1
    fi
    CODE=$(cat "$CODE")
fi

# Run the code
run_code "$CODE"

## 1. Implementation
- [ ] 1.1 Add EXECUTION_MODE env var (local | docker) to executor
- [ ] 1.2 Implement Docker execution path using docker exec or docker-compose exec
- [ ] 1.3 Mount code file into container tmpfs for execution
- [ ] 1.4 Ensure proxy server runs inside container (already configured in docker-compose)
- [ ] 1.5 Update MCP server to read EXECUTION_MODE from environment

## 2. Configuration
- [ ] 2.1 Document environment variables in .env.example
- [ ] 2.2 Add startup script to ensure container is running before MCP server starts

## 3. Testing
- [ ] 3.1 Test docker-compose up starts proxy correctly
- [ ] 3.2 Test code execution inside container
- [ ] 3.3 Test permission flow works through containerized proxy
- [ ] 3.4 Verify security constraints are enforced (can't write outside tmpfs, etc.)

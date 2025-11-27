## 1. Implementation
- [x] 1.1 Add proxy server lifecycle management to executor (start if not running, health check)
- [x] 1.2 Add function to sync session permissions to proxy Control API
- [x] 1.3 Update spawn command to include `--preload ./src/sandbox/preload.ts`
- [x] 1.4 Add cleanup logic to clear proxy permissions after execution
- [x] 1.5 Handle proxy connection errors gracefully

## 2. Testing
- [ ] 2.1 Test code execution with no permissions (should fail on fetch)
- [ ] 2.2 Test granting HTTP permission then retrying (should succeed)
- [ ] 2.3 Test permission cleanup between executions

Server runtime checklist (Netcup/Passenger)

1) Confirm app root
- Open Plesk → Node.js app → Application root should be the folder where `server.js` and `package.json` are located.

2) Run diagnostics in app root
- In the Plesk Node.js console:
  - node scripts/diag_modules.js
- Verify `express`, `envalid`, `ejs`, `dotenv`, `express-session`, `express-mysql-session`, and `mysql2` resolve.

3) Install production dependencies (if missing)
- In the same app root:
  - npm ci --omit=dev

4) Restart Passenger
- Touch restart marker files or deploy the `backend:restart` part.
- After restart, check:
  - https://<domain>/health
  - https://<domain>/health?deep=1

5) Optional: clear view cache
- Hit https://<domain>/__ops/clear-views with admin session or `?admin_token=...`.

If issues persist, ensure `node_modules` and `lib/` are under the same application root recognized by Passenger.

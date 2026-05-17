# README Screenshots

Run the automated flow from the project root:

```bash
npm run screenshots:readme
```

The script expects the app to be reachable at `http://localhost:3000` unless
`OAKATTEST_BASE_URL` is set. It creates a disposable account, organisation,
client, Cloud IRAP engagement, and captures the main product screens.

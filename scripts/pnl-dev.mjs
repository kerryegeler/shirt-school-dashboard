// Local test server for the P&L only (no Slack, Gmail, Kajabi or schedulers).
// Run: node scripts/pnl-dev.mjs   then: npx vite --port 5173  → http://localhost:5173/pnl-dev.html
// (or http://localhost:5173/ for the whole dashboard shell; other sections won't have data)
import 'dotenv/config'
import express from 'express'
import { registerPnl, seedRules } from '../pnl/index.js'

const app = express()
app.use(express.json())
app.use((req, _res, next) => { req.dashboardUser = { email: 'kerry@shirtschool.com' }; next() })
registerPnl(app)
app.get('/api/auth/me', (_req, res) => res.json({ user: { email: 'kerry@shirtschool.com' } }))
app.get('/api/auth/status', (_req, res) => res.json({ accounts: {}, anyConnected: false }))
await seedRules()
app.listen(3001, '127.0.0.1', () => console.log('P&L dev server → http://127.0.0.1:3001'))

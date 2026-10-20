// Local-only entry (pnl-dev.html) to view the P&L page without the dashboard login.
import { createRoot } from 'react-dom/client'
import '../../index.css'
import PnL from './PnL.jsx'
createRoot(document.getElementById('root')).render(<PnL />)

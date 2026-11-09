// Local-only entry (planning-dev.html) to view the page without the dashboard login.
import { createRoot } from 'react-dom/client'
import '../../index.css'
import YearlyPlanning from './YearlyPlanning.jsx'
createRoot(document.getElementById('root')).render(<YearlyPlanning />)

import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth.jsx'
import { LangProvider } from './i18n.jsx'
import Layout from './Layout.jsx'
import Analyzer from './pages/Analyzer.jsx'
import Identify from './pages/Identify.jsx'
import Tierlist from './pages/Tierlist.jsx'
import Duels from './pages/Duels.jsx'
import HallOfFame from './pages/HallOfFame.jsx'
import RosterBuilder from './pages/RosterBuilder.jsx'
import { initTheme } from './theme.js'
import './styles.css'

initTheme()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LangProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Identify />} />
          <Route element={<Layout />}>
            <Route path="/analyzer" element={<Analyzer />} />
            <Route path="/duels" element={<Duels />} />
            <Route path="/tierlist" element={<Tierlist />} />
            <Route path="/hall-of-fame" element={<HallOfFame />} />
            <Route path="/roster-builder" element={<RosterBuilder />} />
          </Route>
        </Routes>
      </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

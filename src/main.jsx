import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth.jsx'
import { LangProvider } from './i18n.jsx'
import Layout from './Layout.jsx'
import Analyzer from './pages/Analyzer.jsx'
import Auth from './pages/Auth.jsx'
import Tierlist from './pages/Tierlist.jsx'
import Duels from './pages/Duels.jsx'
import HallOfFame from './pages/HallOfFame.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LangProvider>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Analyzer />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/duels" element={<Duels />} />
            <Route path="/tierlist" element={<Tierlist />} />
            <Route path="/hall-of-fame" element={<HallOfFame />} />
          </Route>
        </Routes>
      </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

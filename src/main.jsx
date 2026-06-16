import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth.jsx'
import Layout from './Layout.jsx'
import Analyzer from './pages/Analyzer.jsx'
import Auth from './pages/Auth.jsx'
import Tierlist from './pages/Tierlist.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Analyzer />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/tierlist" element={<Tierlist />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

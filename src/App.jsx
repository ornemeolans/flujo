import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from '@/store'
import { startAutoSync } from '@/store/auth'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Transactions from '@/pages/Transactions'
import Wallets from '@/pages/Wallets'
import Analytics from '@/pages/Analytics'
import Settings from '@/pages/Settings'
import AuthAction from '@/pages/AuthAction'
import Spinner from '@/components/ui/Spinner'

export default function App() {
  const { loading, loadAll } = useStore()

  useEffect(() => { loadAll().then(startAutoSync) }, [loadAll])

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', flexDirection:'column', gap:16 }}>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:32, color:'var(--text)' }}>
          flu<span style={{ color:'var(--accent)' }}>jo</span>
        </div>
        <Spinner />
      </div>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/"             element={<Home />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/wallets"      element={<Wallets />} />
        <Route path="/analytics"    element={<Analytics />} />
        <Route path="/settings"     element={<Settings />} />
        <Route path="/auth/:action" element={<AuthAction />} />
        <Route path="*"             element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

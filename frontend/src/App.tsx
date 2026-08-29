import { Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import Admin from './pages/Admin'
import BusinessDashboard from './pages/BusinessDashboard'
import BusinessProfile from './pages/BusinessProfile'
import Home from './pages/Home'
import ProductDetail from './pages/ProductDetail'
import Search from './pages/Search'
import VideoFeed from './pages/VideoFeed'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="business/:slug" element={<BusinessProfile />} />
        <Route path="product/:slug" element={<ProductDetail />} />
        <Route path="feed" element={<VideoFeed />} />
      </Route>
      {/*
        Business Dashboard / Admin Panel are routed outside the consumer
        <Layout /> entirely — they own their own chrome (DashboardShell:
        sidebar + topbar + footer), a deliberately different layout grammar
        from the public site's TopNav/BottomNav, matching the approved
        design pass (see docs/decisions.md's "Process incident" entry and
        docs/design/prototype-v1.html, where entering either screen retires
        the consumer nav — `.app.portal .desktop-nav{display:none}` /
        bottomnav hidden). Wrapping them in Layout here would silently bring
        back exactly the "just a webpage" bug that pass was meant to fix.
      */}
      <Route path="dashboard" element={<BusinessDashboard />} />
      <Route path="admin" element={<Admin />} />
    </Routes>
  )
}

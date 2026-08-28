import { Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import Admin from './pages/Admin'
import BusinessDashboard from './pages/BusinessDashboard'
import Home from './pages/Home'
import Search from './pages/Search'
import VideoFeed from './pages/VideoFeed'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="feed" element={<VideoFeed />} />
        <Route path="dashboard" element={<BusinessDashboard />} />
        <Route path="admin" element={<Admin />} />
      </Route>
    </Routes>
  )
}

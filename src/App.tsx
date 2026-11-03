import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { ParcoursList } from './pages/ParcoursList'
import { Chat } from './pages/Chat'
import { Admin } from './pages/Admin'
import './index.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/parcours" element={<ParcoursList />} />
        <Route path="/messages" element={<Chat />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

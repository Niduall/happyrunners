import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { ParcoursList } from './pages/ParcoursList'
import './index.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/parcours" element={<ParcoursList />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
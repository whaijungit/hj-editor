import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './editor/routes'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

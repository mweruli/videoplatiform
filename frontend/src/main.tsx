import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.tsx'
import AuthModal from './components/auth/AuthModal'
import { AuthProvider } from './lib/auth'
import { CompareProvider } from './lib/compare'
import { queryClient } from './lib/queryClient'
import { ThemeProvider } from './lib/theme'
import { ToastProvider } from './lib/toast'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {/* Needs useToast (add/remove/limit feedback) — nested inside ToastProvider. */}
          <CompareProvider>
            <AuthProvider>
              <BrowserRouter>
                <App />
                <AuthModal />
              </BrowserRouter>
            </AuthProvider>
          </CompareProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)

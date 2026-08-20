import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PasswordRecovery from './Component/PasswordRecovery.jsx'
import './index.css'

const recoveryRequested = new URLSearchParams(window.location.search).get('password-recovery') === '1'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {recoveryRequested ? <PasswordRecovery /> : <App />}
  </React.StrictMode>,
)

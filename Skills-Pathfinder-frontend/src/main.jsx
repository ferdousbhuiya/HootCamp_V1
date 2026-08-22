import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PasswordRecovery from './Component/PasswordRecovery.jsx'
import { installAuthScrollFix } from './lib/authScrollFix.js'
import './index.css'

installAuthScrollFix()

const recoveryRequested = new URLSearchParams(window.location.search).get('password-recovery') === '1'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {recoveryRequested ? <PasswordRecovery /> : <App />}
  </React.StrictMode>,
)

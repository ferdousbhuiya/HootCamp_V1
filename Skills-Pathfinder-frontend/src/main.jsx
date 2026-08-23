import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PasswordRecovery from './Component/PasswordRecovery.jsx'
import { installAuthScrollFix } from './lib/authScrollFix.js'
import './index.css'

installAuthScrollFix()

const installWorkspaceUiEnhancements = () => {
  const enhance = () => {
    const workspaceNav = document.querySelector('nav[aria-label="Primary workspace navigation"]')
    const reportTriggers = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent?.trim() === 'Generate Report')
    const sourceReportButton = reportTriggers.find((button) => button.id !== 'workspace-generate-report')

    if (sourceReportButton) sourceReportButton.classList.add('legacy-report-trigger')

    if (workspaceNav && sourceReportButton && !document.getElementById('workspace-generate-report')) {
      const reportButton = document.createElement('button')
      reportButton.id = 'workspace-generate-report'
      reportButton.type = 'button'
      reportButton.className = 'workspace-report-button shrink-0 rounded-lg px-4 py-2 text-sm font-semibold'
      reportButton.textContent = 'Generate Report'
      reportButton.setAttribute('aria-label', 'Generate career report')
      reportButton.addEventListener('click', () => {
        const currentSource = Array.from(document.querySelectorAll('button')).find((button) =>
          button.id !== 'workspace-generate-report' && button.textContent?.trim() === 'Generate Report'
        )
        currentSource?.click()
      })
      workspaceNav.appendChild(reportButton)
    }

    const sidebar = document.querySelector('.authenticated-shell aside > div')
    if (sidebar) {
      sidebar.classList.add('evidence-navigation')
      const heading = sidebar.querySelector('h2')
      if (heading && heading.textContent?.trim() === 'Menu') heading.textContent = 'Profile & Evidence'
      const nav = sidebar.querySelector('nav')
      nav?.classList.add('evidence-navigation-list')
      Array.from(nav?.querySelectorAll(':scope > button') || []).forEach((button, index) => {
        button.classList.add('evidence-navigation-item')
        button.dataset.navIndex = String(index)
      })
    }
  }

  enhance()
  const observer = new MutationObserver(enhance)
  observer.observe(document.body, { childList: true, subtree: true })
}

const recoveryRequested = new URLSearchParams(window.location.search).get('password-recovery') === '1'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {recoveryRequested ? <PasswordRecovery /> : <App />}
  </React.StrictMode>,
)

if (!recoveryRequested) installWorkspaceUiEnhancements()

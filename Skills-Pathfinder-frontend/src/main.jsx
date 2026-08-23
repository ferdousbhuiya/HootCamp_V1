import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PasswordRecovery from './Component/PasswordRecovery.jsx'
import { installAuthScrollFix } from './lib/authScrollFix.js'
import './index.css'

installAuthScrollFix()

const installWorkspaceUiEnhancements = () => {
  const scrollToAuthPanel = () => {
    const authCard = document.querySelector('main.min-h-screen.bg-slate-50 section .max-w-xl')
    authCard?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const enhanceLandingHeader = () => {
    if (document.querySelector('.authenticated-shell')) return
    const landingMain = document.querySelector('main.min-h-screen.bg-slate-50')
    const header = landingMain?.querySelector(':scope > div.border-b')
    if (!header) return

    header.classList.add('auth-landing-header')
    const row = header.firstElementChild
    row?.classList.add('auth-landing-row')
    const desktopActions = row?.querySelector('.md\\:flex')
    desktopActions?.classList.add('auth-desktop-actions')

    const sourceModeButton = desktopActions ? Array.from(desktopActions.querySelectorAll('button')).find((button) => /create account|sign in/i.test(button.textContent || '')) : null
    if (!sourceModeButton) return

    let mobileActions = document.getElementById('mobile-auth-actions')
    if (!mobileActions) {
      mobileActions = document.createElement('div')
      mobileActions.id = 'mobile-auth-actions'
      mobileActions.className = 'mobile-auth-actions'

      const formButton = document.createElement('button')
      formButton.type = 'button'
      formButton.id = 'mobile-auth-form-button'
      formButton.className = 'mobile-auth-secondary'
      formButton.textContent = 'Sign in'
      formButton.addEventListener('click', scrollToAuthPanel)

      const modeButton = document.createElement('button')
      modeButton.type = 'button'
      modeButton.id = 'mobile-auth-mode-button'
      modeButton.className = 'mobile-auth-primary'
      modeButton.addEventListener('click', () => {
        const currentSource = document.querySelector('.auth-desktop-actions button')
        currentSource?.click()
        window.setTimeout(scrollToAuthPanel, 30)
      })

      mobileActions.append(formButton, modeButton)
      row?.appendChild(mobileActions)
    }

    const mobileModeButton = document.getElementById('mobile-auth-mode-button')
    const mobileFormButton = document.getElementById('mobile-auth-form-button')
    const sourceLabel = sourceModeButton.textContent?.trim() || 'Create account'
    mobileModeButton.textContent = sourceLabel
    mobileFormButton.textContent = sourceLabel === 'Create account' ? 'Sign in' : 'Create account'
    mobileFormButton.onclick = () => {
      if (sourceLabel === 'Create account') {
        scrollToAuthPanel()
      } else {
        sourceModeButton.click()
        window.setTimeout(scrollToAuthPanel, 30)
      }
    }
  }

  const enhanceWorkspaceNavigation = () => {
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

    if (!workspaceNav) return
    workspaceNav.classList.add('workspace-desktop-nav')
    const navParent = workspaceNav.parentElement
    navParent?.classList.add('workspace-nav-shell')

    let mobileToggle = document.getElementById('workspace-mobile-toggle')
    let mobileMenu = document.getElementById('workspace-mobile-menu')
    if (!mobileToggle && navParent) {
      mobileToggle = document.createElement('button')
      mobileToggle.id = 'workspace-mobile-toggle'
      mobileToggle.type = 'button'
      mobileToggle.className = 'workspace-mobile-toggle'
      mobileToggle.setAttribute('aria-expanded', 'false')
      mobileToggle.innerHTML = '<span class="workspace-mobile-toggle-icon">☰</span><span>Workspace</span><span class="workspace-mobile-toggle-chevron">⌄</span>'

      mobileMenu = document.createElement('div')
      mobileMenu.id = 'workspace-mobile-menu'
      mobileMenu.className = 'workspace-mobile-menu'

      mobileToggle.addEventListener('click', () => {
        const open = mobileMenu.classList.toggle('is-open')
        mobileToggle.setAttribute('aria-expanded', String(open))
      })

      navParent.append(mobileToggle, mobileMenu)
    }

    if (mobileMenu) {
      const sourceButtons = Array.from(workspaceNav.querySelectorAll(':scope > button'))
      const signature = sourceButtons.map((button) => `${button.textContent?.trim()}|${button.className}`).join('::')
      if (mobileMenu.dataset.signature !== signature) {
        mobileMenu.dataset.signature = signature
        mobileMenu.replaceChildren()
        sourceButtons.forEach((sourceButton, index) => {
          const item = document.createElement('button')
          item.type = 'button'
          item.className = 'workspace-mobile-menu-item'
          item.dataset.navIndex = String(index)
          if (/bg-teal-400|bg-white text-slate-950/.test(sourceButton.className)) item.classList.add('is-active')
          item.innerHTML = `<span class="workspace-mobile-menu-icon">${['⌂','▤','◎','↗'][index] || '•'}</span><span>${sourceButton.textContent?.trim() || 'Workspace'}</span><span class="workspace-mobile-menu-arrow">›</span>`
          item.addEventListener('click', () => {
            sourceButton.click()
            mobileMenu.classList.remove('is-open')
            mobileToggle?.setAttribute('aria-expanded', 'false')
          })
          mobileMenu.appendChild(item)
        })
      }
    }
  }

  const enhanceEvidenceNavigation = () => {
    const sidebar = document.querySelector('.authenticated-shell aside > div')
    if (!sidebar) return
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

  const enhance = () => {
    enhanceLandingHeader()
    enhanceWorkspaceNavigation()
    enhanceEvidenceNavigation()
  }

  document.addEventListener('click', (event) => {
    const mobileMenu = document.getElementById('workspace-mobile-menu')
    const mobileToggle = document.getElementById('workspace-mobile-toggle')
    if (!mobileMenu?.classList.contains('is-open')) return
    if (mobileMenu.contains(event.target) || mobileToggle?.contains(event.target)) return
    mobileMenu.classList.remove('is-open')
    mobileToggle?.setAttribute('aria-expanded', 'false')
  })

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

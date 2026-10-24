// Installation controls run independently of the TypeScript gesture demo.
(() => {
  const commands = {
    npm: 'npm install finger-gestures',
    pnpm: 'pnpm add finger-gestures',
    bun: 'bun add finger-gestures',
  }
  const tabs = [...document.querySelectorAll('.install-tab')]
  const command = document.getElementById('install-command')
  const copy = document.getElementById('copy-install')
  const label = (text) => {
    copy.setAttribute('aria-label', text)
    copy.title = text
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      command.textContent = commands[tab.dataset.manager]
      tabs.forEach((other) => {
        const selected = other === tab
        other.classList.toggle('active', selected)
        other.setAttribute('aria-selected', String(selected))
        other.tabIndex = selected ? 0 : -1
      })
      label('Copy install command')
    })
    tab.tabIndex = index === 0 ? 0 : -1
    tab.addEventListener('keydown', (event) => {
      let next = index
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = tabs.length - 1
      else return
      event.preventDefault()
      tabs[next].click()
      tabs[next].focus()
    })
  })
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(command.textContent)
      label('Copied install command')
    } catch {
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(command)
      selection.removeAllRanges()
      selection.addRange(range)
      label('Command selected — press Ctrl+C or Command+C')
    }
  })
})()

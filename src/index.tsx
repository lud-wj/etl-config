import { createRoot } from 'react-dom/client'
import App from 'components/App'
import { createTheme, WuiProvider } from '@welcome-ui/core'

const container = document.getElementById('root') as HTMLDivElement
const root = createRoot(container)
const theme = createTheme({ radii: { sm: '0px', md: '0px', lg: '10px' } })

root.render(
  <WuiProvider theme={theme}>
    <App />
  </WuiProvider>
)

import Avatar from 'components/Avatar'
import logo from 'assets/logo.svg'
import { Box, BoxProps } from '@welcome-ui/box'

import ConfigForm from './ConfigFrom'

const randoms = [
  [1, 2],
  [3, 4, 5],
  [6, 7]
]

function App() {
  return (
    <Box maxWidth={800} mx="auto" p="lg">
      <ConfigForm />
    </Box>
  )
}

export default App

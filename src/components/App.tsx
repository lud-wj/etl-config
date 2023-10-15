import Avatar from 'components/Avatar'
import logo from 'assets/logo.svg'
import { Box, BoxProps } from '@welcome-ui/box'

import TransformForm from './ConfigForm'

const randoms = [
  [1, 2],
  [3, 4, 5],
  [6, 7]
]

function App() {
  return (
    <Box maxWidth={800} mx="auto" p="lg">
      <TransformForm />
    </Box>
  )
}

export default App

import { useCallback, useEffect, useState } from 'react'
import configSchema from '../schema.json'
import { Field } from '@welcome-ui/field'
import { Select } from '@welcome-ui/select'
import { Button } from '@welcome-ui/button'
import { InputText } from '@welcome-ui/input-text'
import { Label } from '@welcome-ui/label'
import { Flex } from '@welcome-ui/flex'
import { AddIcon, TrashIcon, DownIcon, UpIcon } from '@welcome-ui/icons'
import { flexShrink } from '@xstyled/styled-components'
import { Input } from 'postcss'
import { Box } from '@welcome-ui/box'
console.clear()

interface StepConfig {
  type: string
  params: Params
}

type Params = Record<string, any>

function implKeys(schema: any) {
  return schema.anyOf.map((item) => item['$ref'].replace('#/$defs/', ''))
}

function importDef(confSchema, key: string) {
  const def = confSchema.$defs[key]
  return {
    title: def['etl-name'],
    type: def.properties.type.enum[0],
    params: importParams(def.properties.params.properties)
  }
}

function importParams(paramProperties) {
  const params = {}
  for (const [key, value] of Object.entries(paramProperties)) {
    params[key] = importParam(value, key)
  }
  return params
}

function importParam(paramDef, key) {
  const param = { ...paramDef, key }
  switch (param.type) {
    case void 0:
      if (paramDef.$ref == '#/$defs/transform_function') {
        param.type = 'tfunction'
      } else {
        throw new Error(
          'unhandled type ' + paramDef.type + ': ' + JSON.stringify(paramDef)
        )
      }
      break
    case 'array':
      param.items = importParam(paramDef.items)
      break
    case 'string':
    case 'boolean':
      // pass
      break
    default:
      throw new Error(
        'unhandled type ' + paramDef.type + ': ' + JSON.stringify(paramDef)
      )
  }
  return param
}

// const sources = implKeys(configSchema.$defs.source).map(k => pullDef(configSchema, k))
// const targets = implKeys(configSchema.$defs.target).map(k => pullDef(configSchema, k))
const tsteps = implKeys(configSchema.$defs.transform_step).map((k) =>
  importDef(configSchema, k)
)
const tfuns = implKeys(configSchema.$defs.transform_function).map((k) =>
  importDef(configSchema, k)
)
const tstepIndex = Object.fromEntries(tsteps.map((step) => [step.type, step]))

type deriveKey = string | number
type derivePath = deriveKey | deriveKey[]
function deriveSetter(setter, path: derivePath, index: number = 0) {
  if (!Array.isArray(path)) path = [path]
  if (index == path.length) {
    return setter
  }

  const key = path[index]
  let derived = null

  if (typeof key === 'string') {
    derived = function (update) {
      const subsetter = typeof update === 'function' ? update : () => update
      setter((obj) => ({ ...obj, [key]: subsetter(obj[key]) }))
    }
  } else if (typeof key === 'number') {
    derived = function (update) {
      const subsetter = typeof update === 'function' ? update : () => update
      setter((array) => {
        const copy = array.slice()
        copy[key] = subsetter(copy[key])
        return copy
      })
    }
  } else {
    throw new Error(
      'unsupported path key type: ' + typeof key + ': ' + JSON.stringify(path)
    )
  }
  return deriveSetter(derived, path, index + 1)
}

function ConfigForm() {
  const configID = 'some-uuid'
  const cacheVsn = '1'
  const cacheKey = `config-${configID}-${cacheVsn}`

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem(cacheKey)
    return saved ? JSON.parse(saved) : { transform: [] }
  })

  useEffect(() => {
    localStorage.setItem(cacheKey, JSON.stringify(config))
  }, [config])

  const setTransform = deriveSetter(setConfig, ['transform'])

  function addTransformStep(type) {
    const step = tstepIndex[type]
    setTransform((steps) => [...steps, { type, params: {} }])
  }

  const displayedSteps = config.transform.map((step, i) => {
    const setParams = deriveSetter(setTransform, [i, 'params'])
    const deleteStep = () =>
      setTransform((steps) => steps.filter((_, j) => j !== i))

    return (
      <StepConfigInput
        stepConfig={step}
        setParams={setParams}
        deleteStep={deleteStep}
        key={i}
      />
    )
  })

  return (
    <div className="container mx-auto bg-gray-200 p-2">
      <Flex direction="column">{displayedSteps}</Flex>
      <StepPicker add={(type) => addTransformStep(type)} />
      <pre>{JSON.stringify(tsteps, null, '  ')}</pre>
    </div>
  )
}

function StepPicker({ add }) {
  const options = tsteps.map(({ title, type }) => ({
    label: title,
    value: type
  }))

  return (
    <Field label="Add a new step">
      <Select isSearchable options={options} value={null} onChange={add} />
    </Field>
  )
}

function listPartition(list, predicate, valueFun) {
  const truthy = []
  const falsy = []
  list.forEach((item) => {
    if (predicate(item)) truthy.push(valueFun(item))
    else falsy.push(valueFun(item))
  })

  return [truthy, falsy]
}


function isBlockInput(paramDef) {
  if (paramDef.type == 'tfunction') return true
  if (paramDef.type == 'array') return true
  return false
}

function StepConfigInput({ stepConfig, setParams, deleteStep }) {
  const { type, params } = stepConfig
  const def = tstepIndex[type]

  let [blockInputs, inlineInputs] = listPartition(
    Object.entries(def.params),
    ([key, value]) => isBlockInput(value),
    ([key, value]) => ({ ...value, key: key })
  )

  blockInputs = blockInputs.map((paramDef) => <BlockBox key={paramDef.key}>
    <ParamLabel title={paramDef.key} />
    {makeInput(paramDef, params, setParams)}
  </BlockBox>
  )

  inlineInputs = inlineInputs.map((paramDef) => <InlineBox key={paramDef.key}>
    <ParamLabel title={paramDef.key} />
    {makeInput(paramDef, params, setParams)}
  </InlineBox>
  )

  const [expanded, setExpanded] = useState(true)

  return (
    <Flex
      direction="column"
      border="1px solid #ccc"
      mb="4"
      boxShadow="1px 1px 2px #aaa"
    >
      {/* Header */}
      <Flex justifyContent="space-between" align="center" p="0">
        <Label p="5" fontFamily="monospace" fontSize="18px" fontWeight="600">
          {def.title}
        </Label>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{ flex: '1', alignSelf: 'stretch' }}
        >
          &nbsp;
        </div>
        <Flex pr="4" columnGap="4">
          <CfgButton icon={<TrashIcon />} onClick={deleteStep} />
          <CfgButton
            icon={expanded ? <UpIcon /> : <DownIcon />}
            onClick={() => setExpanded(!expanded)}
          />
        </Flex>
      </Flex>
      {/* Body */}

      {expanded && (
        <>
          <Flex
            direction="row"
            justify="flex-start"
            align="flext-end"
            wrap="wrap"
          >
            {inlineInputs}
          </Flex>

          <Box>{blockInputs}</Box>
        </>
      )}
      <pre>{JSON.stringify(params, null, '  ')}</pre>
      <pre>{JSON.stringify(def, null, '  ')}</pre>
    </Flex>
  )
}

function CfgButton(props) {
  const icon = props.icon
  return (
    <Button {...props} size="xs" backgroundColor="transparent" border="none">
      {icon}
      {props.label}
    </Button>
  )
}

function makeInput(paramDef, params, setParams) {
  const value = params[paramDef.key]
  const setValue = deriveSetter(setParams, paramDef.key)
  switch (paramDef.type) {
    case 'string':
      return makeInputText(paramDef, value, setValue)
    case 'array':
      return makeInputList(paramDef, value, setValue)
    default:
      throw new Error('unhandled paramDef.type: ' + paramDef.type)
  }
}

function ParamLabel({ title }) {
  return (
    <Label pr="3" fontFamily="monospace">
      {title + ': '}
    </Label>
  )
}

function InlineBox({ children }) {
  return (
    <Flex px="4" py="2" mx="4">
      {children}
    </Flex>
  )
}

function BlockBox({ children }) {
  return (
    <Box px="4" py="2" mx="4">
      {children}
    </Box>
  )
}

function makeInputText(paramDef, value, changeParamValue) {
  return <InputText
    size="xs"
    name="firstName"
    value={value || ''}
    onChange={(evt) => changeParamValue(evt.target.value)}
  />
}



function makeInputList(paramDef, value, changeParamValue) {
  value = value || []
  const pushNewValue = (newVal) =>
    changeParamValue((oldVal) => [...(oldVal || []), newVal])

  return (
    <Flex direction="column" align="flex-start" style={{ width: '100%' }}>
      <HorizontalLine />
      <AddNewValue itemType={paramDef.items.type} add={pushNewValue} />
    </Flex>
  )
}

function HorizontalLine() {
  const style = {
    borderBottom: '1px solid #ccc',
    width: '100%',
    height: '1px',
    margin: '3px 0',
    alignSelf: 'stretch'
  }
  return <Box style={style} />
}

function AddNewValue({ itemType, add }) {
  switch (itemType) {
    case 'string':
      return <AddNewString add={add} />
    default:
      throw new Error('unhandled add value for item type: ' + itemType)
  }
}

function AddNewString({ add }) {
  const [value, setValue] = useState('')
  return (
    <Flex>
      <InputText
        size="xs"
        name="firstName"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <CfgButton
        icon={<AddIcon />}
        label="Add"
        onClick={() => {
          add(value)
          setValue('')
        }}
      />
    </Flex>
  )
}

export default ConfigForm

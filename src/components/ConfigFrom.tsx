import { Box } from '@welcome-ui/box'
import { Button } from '@welcome-ui/button'
import { Field } from '@welcome-ui/field'
import { Flex } from '@welcome-ui/flex'
import {
  AddIcon,
  CrossIcon,
  DownIcon,
  TrashIcon,
  UpIcon
} from '@welcome-ui/icons'
import { InputText } from '@welcome-ui/input-text'
import { Label } from '@welcome-ui/label'
import { Select } from '@welcome-ui/select'
import { useCallback, useEffect, useMemo, useState } from 'react'
import configSchema from '../schema.json'

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

// We probably want to use a context here instead of caching in the module body.
const definitions = {
  tsteps: [],
  tstepIndex: {},
  tfunctions: [],
  tfunctionIndex: {}
}

// Simulate download from endpoint so we already handle async loading
function buildConfigDefinitions() {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      doBuildConfigDefinitions()
      resolve()
    }, 1)
  })
}

// but it does not work well in dev with HMR so we call that here
doBuildConfigDefinitions()

function doBuildConfigDefinitions() {
  // definitions.sources = implKeys(configSchema.$defs.source).map(k => pullDef(configSchema, k))
  // definitions.targets = implKeys(configSchema.$defs.target).map(k => pullDef(configSchema, k))
  definitions.tsteps = implKeys(configSchema.$defs.transform_step).map((k) =>
    importDef(configSchema, k)
  )

  definitions.tstepIndex = Object.fromEntries(
    definitions.tsteps.map((step) => [step.type, step])
  )

  definitions.tfunctions = implKeys(configSchema.$defs.transform_function).map(
    (k) => importDef(configSchema, k)
  )

  definitions.tfunctionIndex = Object.fromEntries(
    definitions.tfunctions.map((f) => [f.type, f])
  )
}

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

function deriveArrayDeleteIndex(setArray, index) {
  return function () {
    return setArray((array) => array.filter((_, i) => i !== index))
  }
}

function ConfigForm() {
  const configID = 'some-uuid'
  const cacheVsn = '1'
  const cacheKey = `config-${configID}-${cacheVsn}`

  const [definitionsReady, setDefinitionsReady] = useState(false)
  useEffect(() => {
    buildConfigDefinitions().then(() => setDefinitionsReady(true))
  }, [definitionsReady])

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem(cacheKey)
    return saved ? JSON.parse(saved) : { transform: [] }
  })

  useEffect(() => {
    localStorage.setItem(cacheKey, JSON.stringify(config))
  }, [config])

  const setTransform = deriveSetter(setConfig, ['transform'])

  function addTransformStep(type) {
    const step = definitions.tstepIndex[type]
    setTransform((steps) => [...steps, { type, params: {} }])
  }

  if (definitionsReady == false) return <div>Loading...</div>
  else
    return (
      <div className="container mx-auto bg-gray-200 p-2">
        <Flex direction="column">
          {config.transform.map((step, i) => {
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
          })}
        </Flex>
        <StepPicker add={(type) => addTransformStep(type)} />
        <pre>{JSON.stringify(config, null, '  ')}</pre>
        <pre>{JSON.stringify(definitions, null, '  ')}</pre>
      </div>
    )
}

function StepPicker({ add }) {
  const options = definitions.tsteps.map(({ title, type }) => ({
    label: title,
    value: type
  }))

  return (
    <Field label="Add a new step">
      <Select isSearchable options={options} value={null} onChange={add} />
    </Field>
  )
}

function FunctionPicker({ add }) {
  const options = definitions.tfunctions.map(({ title, type }) => ({
    label: title,
    value: type
  }))

  return (
    <Field label="Add a new transformer">
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
  const [expanded, setExpanded] = useState(true)

  const { type, params } = stepConfig
  const def = definitions.tstepIndex[type]
  console.log(`def`, def)

  let [blockInputs, inlineInputs] = listPartition(
    Object.entries(def.params),
    ([key, value]) => isBlockInput(value),
    ([key, value]) => ({ ...value, key: key })
  )

  blockInputs = blockInputs.map((paramDef) => (
    <BlockBox key={paramDef.key}>
      <ParamLabel title={paramDef.key} />
      <Box style={{ paddingLeft: '2rem' }}>
        <CfgInput
          paramDef={paramDef}
          value={params[paramDef.key]}
          setValue={deriveSetter(setParams, paramDef.key)}
        />
      </Box>
    </BlockBox>
  ))

  inlineInputs = inlineInputs.map((paramDef) => (
    <InlineBox key={paramDef.key}>
      <ParamLabel title={paramDef.key} />
      <CfgInput
        paramDef={paramDef}
        value={params[paramDef.key]}
        setValue={deriveSetter(setParams, paramDef.key)}
      />
    </InlineBox>
  ))

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

function CfgInput({ paramDef, value, setValue }) {
  console.log(`paramDef`, paramDef)
  switch (paramDef.type) {
    case 'string':
      return (
        <CfgInputString paramDef={paramDef} value={value} setValue={setValue} />
      )
    case 'array':
      return (
        <CfgInputList paramDef={paramDef} value={value} setValue={setValue} />
      )
    case 'tfunction':
      return (
        <CfgInputTFunction
          paramDef={paramDef}
          value={value}
          setValue={setValue}
        />
      )
    default:
      throw new Error('unhandled input param type: ' + paramDef.type)
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

function CfgInputString({ paramDef, value, setValue }) {
  return (
    <InputText
      size="xs"
      name="firstName"
      value={value || ''}
      onChange={(evt) => setValue(evt.target.value)}
    />
  )
}

function CfgInputTFunction({ paramDef, value, setValue }) {
  if (!value) {
    return <FunctionPicker add={(type) => setValue({ type, params: {} })} />
  }
  else return (
    <pre>
      paramDef: {JSON.stringify(paramDef, null, '  ')}
      value: {JSON.stringify(value, null, '  ')} ({typeof value})
    </pre>
  )
}

function CfgInputList({ paramDef, value, setValue }) {
  value = value || []

  const [stagingItemValue, setStagingItemValue] = useState(void 0)

  const shouldAddOnChange = useMemo(() => ['tfunction'].includes(paramDef.items.type), [paramDef.items.type])

  function commitStating() {
    addToList(stagingItemValue)
    resetStaging()
  }

  function resetStaging() {
    setStagingItemValue(void 0)
  }

  function addToList(item) {
    setValue((oldVal) => [...(oldVal || []), item])
  }

  const subSetter = shouldAddOnChange
    ? (val) => {
      addToList(val)
      resetStaging()
    }
    : setStagingItemValue

  const items = value.map((item, i) => (
    <Flex key={i} direction="row">
      <CfgInput
        paramDef={paramDef.items}
        value={item}
        setValue={deriveSetter(setValue, i)}
      />
      <CfgButton
        icon={<CrossIcon />}
        onClick={deriveArrayDeleteIndex(setValue, i)}
      />
    </Flex>
  ))

  return (
    <Flex direction="column" align="flex-start" style={{ width: '100%' }}>
      {items}
      <HorizontalLine />
      <Flex direction="row">
        <CfgInput
          paramDef={paramDef.items}
          value={stagingItemValue}
          setValue={subSetter}
        />
        {!shouldAddOnChange &&
          <CfgButton
            icon={<AddIcon />}
            label="Add"
            onClick={commitStating}
          />}
      </Flex>
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

export default ConfigForm

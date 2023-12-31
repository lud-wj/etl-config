import { Box } from '@welcome-ui/box'
import { Button } from '@welcome-ui/button'
import { Field } from '@welcome-ui/field'
import { Flex } from '@welcome-ui/flex'
import { Toggle } from '@welcome-ui/toggle'
import { Tab, Tabs, useTab } from '@welcome-ui/tabs'
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

// TODO using tabs cause this warning to show in console: The `children` prop as
// a function is deprecated. Use the `render` prop instead. See
// https://ariakit.org/guide/composition

function ConfigForm() {
  const tab = useTab({ defaultSelectedId: 'tabTransform' })
  const [definitionsReady, setDefinitionsReady] = useState(false)

  const configID = 'some-uuid'
  const cacheVsn = '1'
  const cacheKey = `config-${configID}-${cacheVsn}`

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
      <div style={{ backgroundColor: '#efefef', padding: '.5rem 1rem' }}>
        <Tab.List store={tab}>
          <Tab store={tab} id="tabTransform">
            Transform Configuration
          </Tab>
          <Tab store={tab} id="tabJSON">
            Raw JSON Configuration
          </Tab>
        </Tab.List>
        <Tab.Panel store={tab} tabId="tabTransform">
          <h2>Transform Configuration</h2>
          <Flex direction="column">
            {config.transform.map((step, i) => {
              const setParams = deriveSetter(setTransform, [i, 'params'])
              const deleteStep = deriveArrayDeleteIndex(setTransform, i)

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
          <Box style={{ height: '200px' }}>&nbsp;</Box>
        </Tab.Panel>
        <Tab.Panel store={tab} tabId="tabJSON">
          <h2>Raw JSON Configuration</h2>
          <pre
            style={{
              padding: '1rem',
              backgroundColor: '#ddd',
              color: '#333',
              borderRadius: '3px'
            }}
          >
            <code>{JSON.stringify(config, null, '  ')}</code>
          </pre>
        </Tab.Panel>
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
      <Select
        isSearchable
        options={options}
        value={null}
        onChange={add}
        size="xs"
      />
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

function Box2(props) {
  const { children } = props
  return (
    <Box
      style={{
        backgroundColor: '#fff',
        border: '1px solid #ccc',
        boxShadow: '1px 1px 3px #ccc',
        padding: '3px'
      }}
      {...props}
    >
      {children}
    </Box>
  )
}

function StepConfigInput({ stepConfig, setParams, deleteStep }) {
  const [expanded, setExpanded] = useState(true)

  const { type, params } = stepConfig
  const def = definitions.tstepIndex[type]

  return (
    <Flex direction="row" align="flex-start" style={{ marginBottom: '1rem' }}>
      <Box2 flex="1 0 0">
        <Label p="5" fontFamily="monospace" fontSize="18px" fontWeight="400">
          {def.title}
        </Label>
      </Box2>

      {expanded && (
        <Box flex="2 0 min-content">
          <CfgParams definition={def} params={params} setParams={setParams} />
        </Box>
      )}

      <Box2 flex="0 0 0">
        <Flex direction={'row'}>
          <CfgButton icon={<TrashIcon />} onClick={deleteStep} />
          <CfgButton
            icon={expanded ? <UpIcon /> : <DownIcon />}
            onClick={() => setExpanded(!expanded)}
          />
        </Flex>
      </Box2>

      {/* Body */}
    </Flex>
  )
}

function paramField(paramDef, value, setValue, isBlock = false) {
  return (
    <Box2 flex="2 0 0" key={paramDef.key}>
      <Field label={paramDef.key}>
        <CfgInput paramDef={paramDef} value={value} setValue={setValue} />
      </Field>
    </Box2>
  )
}

function CfgParams({ definition, params, setParams }) {
  let [blockInputs, inlineInputs] = listPartition(
    Object.entries(definition.params),
    ([key, value]) => isBlockInput(value),
    ([key, value]) => ({ ...value, key: key })
  )

  blockInputs = blockInputs.map((paramDef) =>
    paramField(
      paramDef,
      params[paramDef.key],
      deriveSetter(setParams, paramDef.key),
      true
    )
  )

  inlineInputs = inlineInputs.map((paramDef) =>
    paramField(
      paramDef,
      params[paramDef.key],
      deriveSetter(setParams, paramDef.key)
    )
  )

  return (
    <Box>
      <Flex direction="row" justify="flex-start" align="flext-end" wrap="wrap">
        {inlineInputs}
      </Flex>

      <Box>{blockInputs}</Box>
    </Box>
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
    case 'boolean':
      return (
        <CfgInputBoolean
          paramDef={paramDef}
          value={value}
          setValue={setValue}
        />
      )
    default:
      throw new Error('unhandled input param type: ' + paramDef.type)
  }
}

function CfgInputString({ paramDef, value, setValue }) {
  return (
    <InputText
      size="xs"
      value={value || ''}
      onChange={(evt) => setValue(evt.target.value)}
    />
  )
}

function CfgInputBoolean({ paramDef, value, setValue }) {
  return (
    <Box>
      <Toggle checked={value || false} onChange={(e) => setValue(!value)} />
    </Box>
  )
}

function CfgInputTFunction({ paramDef, value, setValue }) {
  if (!value) {
    return (
      <Box style={{ paddingLeft: '.5rem' }}>
        <FunctionPicker add={(type) => setValue({ type, params: {} })} />
      </Box>
    )
  } else {
    const def = definitions.tfunctionIndex[value.type]

    return (
      <Flex
        direction="row"
        align="flex-start"
        marginBottom="1rem"
        style={{ paddingLeft: '.5rem' }}
      >
        <Box2 flex="1 0 0">
          <Label p="5" fontFamily="monospace" fontSize="18px" fontWeight="400">
            {def.title}
          </Label>
        </Box2>
        <Box flex="2 0 min-content">
          <CfgParams
            definition={def}
            params={value.params}
            setParams={deriveSetter(setValue, 'params')}
          />
        </Box>
      </Flex>
    )
  }
}

function CfgInputList({ paramDef, value, setValue }) {
  value = value || []

  const [stagingItemValue, setStagingItemValue] = useState(void 0)

  const shouldAddOnChange = useMemo(
    () => ['tfunction'].includes(paramDef.items.type),
    [paramDef.items.type]
  )

  function commitStating() {
    addToList(stagingItemValue)
  }

  function addToList(item) {
    setValue((oldVal) => [...(oldVal || []), item])
    setStagingItemValue(void 0)
  }

  const subSetter = shouldAddOnChange
    ? (val) => {
        addToList(val)
      }
    : setStagingItemValue

  const items = value.map((item, i) => (
    <Flex key={i} direction="row">
      <Box flex="2 0 0">
        <CfgInput
          paramDef={paramDef.items}
          value={item}
          setValue={deriveSetter(setValue, i)}
        />
      </Box>
      <CfgButton
        icon={<CrossIcon />}
        onClick={deriveArrayDeleteIndex(setValue, i)}
      />
    </Flex>
  ))

  return (
    <Flex direction="column" align="stretch">
      {items.length ? (
        items
      ) : (
        <Box style={{ paddingLeft: '.5rem' }}>No items</Box>
      )}
      <HorizontalLine />
      <Flex direction="row">
        <CfgInput
          paramDef={paramDef.items}
          value={stagingItemValue}
          setValue={subSetter}
        />
        {!shouldAddOnChange && (
          <CfgButton icon={<AddIcon />} label="Add" onClick={commitStating} />
        )}
      </Flex>
    </Flex>
  )
}

function HorizontalLine() {
  const style = {
    borderBottom: '1px solid #efefef',
    height: '1px',
    margin: '3px 0'
  }
  return <Box style={style} />
}

export default ConfigForm

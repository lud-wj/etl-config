import { useCallback, useEffect, useState } from 'react'
import configSchema from '../schema.json'
import { Field } from '@welcome-ui/field'
import { Select } from '@welcome-ui/select'
import { Button } from '@welcome-ui/button'

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
    params[key] = importParam(value)
  }
  return params
}

function importParam(paramDef) {
  const param = { type: paramDef.type }
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
  }
  else if (typeof key === 'number') {
    derived = function (update) {
      const subsetter = typeof update === 'function' ? update : () => update
      setter((array) => {
        const copy = array.slice()
        copy[key] = subsetter(copy[key])
        return copy
      })
    }
  }
  else {
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
      <StepConfig
        stepConfig={step}
        setParams={setParams}
        deleteStep={deleteStep}
        key={i}
      />
    )
  })

  return (
    <div className="container mx-auto bg-gray-200 p-2">
      <ul>{displayedSteps}</ul>
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

function listPartition(list, predicate) {
  const truthy = []
  const falsy = []
  list.forEach((item) => {
    if (predicate(item)) truthy.push(item)
    else falsy.push(item)
  })
  return [truthy, falsy]
}

function isBlockInput(paramDef) {
  if (paramDef.type == 'tfunction') return true
  if (paramDef.type == 'array') return true
  return false
}

function StepConfig({ stepConfig, setParams, deleteStep }) {
  const { type, params } = stepConfig
  const def = tstepIndex[type]
  const [blockInputs, inlineInputs] = listPartition(
    Object.entries(def.params),
    ([key, value]) => isBlockInput(value)
  )
  console.log(`blockInputs`, blockInputs)
  console.log(`inlineInputs`, inlineInputs)
  return (
    <div>
      <h2>{def.title}</h2>
      <Button onClick={deleteStep} size="xxs">
        X
      </Button>

      <pre>{JSON.stringify(params, null, '  ')}</pre>
      <pre>{JSON.stringify(def, null, '  ')}</pre>
    </div>
  )
}

export default ConfigForm

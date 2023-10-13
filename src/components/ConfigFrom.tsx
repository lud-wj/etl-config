import { useCallback, useState } from 'react'
import configSchema from '../schema.json'
import { Field } from '@welcome-ui/field'
import { Select } from '@welcome-ui/select'

console.clear()

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

function ConfigForm() {
  const [transformSteps, setTransformSteps] = useState([])

  function addTransformStep(type) {
    const step = tstepIndex[type]
    setTransformSteps((steps) => [...steps, { type, def: step, params: {} }])
  }

  const displayedSteps = transformSteps.map((step, i) => {
    const updateStep = function (newParams) {
      setTransformSteps(steps => steps.map((s, j) => {
        if (j == i) {
          return { ...s, params: newParams }
        } else {
          return s
        }
      }))
    }

    return <StepConfig {...step} key={i} />
  })

  return (
    <div className="container mx-auto bg-gray-200 p-2">
      <ul>
        {displayedSteps}
      </ul>
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

function StepConfig({ type, def, params }) {
  return <div>
    <h2>{def.title}</h2>
    <pre>{JSON.stringify(params, null, '  ')}</pre>
    <pre>{JSON.stringify(def, null, '  ')}</pre>
  </div>
}


export default ConfigForm

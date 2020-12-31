/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

/**
 * @param {*} key props 中的 key
 * @param {*} propOptions 组件的 props 属性
 * @param {*} propsData 父组件传递的 props
 * @param {*} vm 组件实例
 * @returns {*}
 */
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  const prop = propOptions[key]
  // 如果子组件定义了 prop 而父组件没有给它传值
  const absent = !hasOwn(propsData, key)
  let value = propsData[key]
  // boolean casting
  // 处理 Boolean 类型的 props
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // 如果有 boolean 类型的值
  if (booleanIndex > -1) {
    // prop 没有接收到值，且没有定义默认值
    if (absent && !hasOwn(prop, 'default')) {
      value = false
      // hyphenate 将驼峰变为连字符
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // stringIndex < 0
      // 这里就是为什么子组件的 props 如果定义的类型是 Boolean
      // 在使用时可以只写 props 或者 props="props-props" 而不需要写 :props="true"
      // 的原因
      // <child-component fixed /> 不管 prop 是什么类型，当只写了属性名而不写 = 和值，的时候，默认传递的是空字符串 ''
      // <child-component fixed="fixed" />

      /*
        // 对于组件 A， booleanIndex < stringIndex，boolean 的优先级大于 string， value = true
        // Child Component A
        export default {
          name: 'ChildComponentA'
          props: {
              fixed: [Boolean, String]
            }
          }
        // 对于组件 B， booleanIndex > stringIndex，string 的优先级大于 boolean， value 不做处理
        // Child Component B
        export default {
          name: 'ChildComponentB',
          props: {
            fixed: [String, Boolean]
          }
        }
      */
      const stringIndex = getTypeIndex(String, prop.type)
      // boolean 类型的优先级 高于 string 类型
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  // check default value
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    // 因为默认值是一个新拷贝，所以一定要 observe 一下。
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && '@binding' in value)
  ) {
    // 断言分三种情况 required， type 为数组，用户提供了 validator
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 如果 prop.default 是一个引用类型则必须使用函数返回的形式来定义
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' +
        key +
        '": ' +
        'Props with type Object/Array must use a factory function ' +
        'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // 这个是发生在 props 更新时的流程
  // 发生在以下场景:
  /*
  * 1. 父组件没有给子组件传值，并且子组件的 props 定义了 default。
  * 2. 当第一次渲染时，就会拿默认值作为值
  * 3. 当发生更新时，就直接获取这个值就行。
  * 4. 假如说没有这一步操作，并且当我们的 props 是一个引用类型的时候，
  *    当发生更新时就会重新执行一遍 default 函数（就是最后的那段代码），这样返回的引用类型就不是同一个了，
  *    就会触发 user watcher（如果定义了） 的 callback，这一步是没有必要的。
  * */
  if (
    vm &&
    vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 判断类型来获取 default 值，如果是函数则执行，如果不是直接返回。
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // require 断言
  if (prop.required && absent) {
    warn('Missing required prop: "' + name + '"', vm)
    return
  }
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  let valid = !type || type === true
  const expectedTypes = []
  // 类型断言
  if (type) {
    if (!Array.isArray(type)) {
      type = [type]
    }
    // 只要当前props的类型和类型数组中某一个元素匹配则终止遍历
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i])
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  if (!valid) {
    warn(getInvalidTypeMessage(name, value, expectedTypes), vm)
    return
  }
  const validator = prop.validator
  // 用户自定义 validator 断言
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  // 判断传入的 prop 值的类型是否与所需的 prop 类型相同
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes): number {
  // 组件的 props 如果是普通写法 propsA: Boolean
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  // 组件的 props 如果是数组的写法 propsA: [Boolean, String]
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (expectedTypes.length === 1 &&
      isExplicable(expectedType) &&
      !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable (value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}

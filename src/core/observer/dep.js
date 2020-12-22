/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher
  id: number
  subs: Array<Watcher>

  constructor() {
    this.id = uid++
    this.subs = []
  }

  // 由劫持后的 get访问函数触发dep.depend ， dep.depend 中的 watcher 实例的 addDep 方法 调用
  // 保存了所有 watcher 包括渲染watcher，user watcher，computed watcher
  addSub(sub: Watcher) {
    // dep.subs 保留着所有访问到
    // 让依赖知道有哪些watcher订阅了自己 收集watcher
    this.subs.push(sub)
  }

  removeSub(sub: Watcher) {
    remove(this.subs, sub)
  }

  depend() {
    if (Dep.target) {
      // watcher.newDeps 里保留着 dep
      // 让渲染watcher 订阅 这个 dep（收集依赖）

      // computed watcher 中 引用的 data 依赖，所收集的是渲染watcher，
      // 因为 computed watcher 计算结束后将computed watcher pop 出去了
      Dep.target.addDep(this)
    }
  }

  notify() {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

// 栈 保留着每一次 Watcher.prototype.get 触发时的 watcher 实例（不仅仅只是渲染watcher）
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}

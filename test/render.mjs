/**
 * node 里没有 react-dom，而设置页的行为恰好都在元素树里（`<select>` 的选项、
 * 每行有没有删除按钮）。这里用一个极小的 React 替身把生产产物渲染成纯对象树：
 * 支持 `useState`/`useEffect`/`useRef`/`useCallback`/`useId`，并在 setState 后同步重渲染。
 * 只服务于测试，不进产物。
 *
 * 支持**嵌套函数组件**：设置页容器会把两页内容作为子组件渲染，所以钩子状态按
 * "组件在树中的路径"分开存放，而不是整棵树共用一个槽位数组（否则父子组件的钩子会互相串位）。
 */

/** 造一份替身 React 与 jsx-runtime，以及一个同步渲染器。 */
export function createHarness() {
  /** 每个组件路径一份钩子槽位。 */
  const componentSlots = new Map()
  let slots = []
  let cursor = 0
  let flushing = false
  let dirty = false
  let tree = null
  let Component = null
  let props = null
  let pending = []

  const schedule = () => {
    dirty = true
    flush()
  }

  /** 用给定槽位数组执行一个组件函数，返回它的元素输出。 */
  function runComponent(type, componentProps, path) {
    let own = componentSlots.get(path)
    if (own === undefined) {
      own = []
      componentSlots.set(path, own)
    }
    const outerSlots = slots
    const outerCursor = cursor
    slots = own
    cursor = 0
    try {
      return type(componentProps)
    } finally {
      slots = outerSlots
      cursor = outerCursor
    }
  }

  /** 深度展开函数组件，同时记录本轮的 effect。 */
  function expand(node, path) {
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}.${index}`))
    if (node === null || typeof node !== 'object' || !('props' in node)) return node
    if (typeof node.type === 'function') {
      const rendered = runComponent(node.type, node.props, path)
      return expand(rendered, `${path}>`)
    }
    const children = node.props?.children
    return { ...node, props: { ...node.props, children: expand(children, `${path}.${String(node.type)}`) } }
  }

  function renderOnce() {
    pending = []
    Component = Component
    tree = expand(runComponentRoot(), 'root')
    const jobs = pending
    pending = []
    for (const job of jobs) {
      if (typeof job.cleanup === 'function') job.cleanup()
      const cleanup = job.run()
      job.cleanup = typeof cleanup === 'function' ? cleanup : undefined
    }
  }

  /** 根组件单独一次，避免与子组件共用路径。 */
  function runComponentRoot() {
    let own = componentSlots.get('root')
    if (own === undefined) {
      own = []
      componentSlots.set('root', own)
    }
    const outerSlots = slots
    const outerCursor = cursor
    slots = own
    cursor = 0
    try {
      return Component(props)
    } finally {
      slots = outerSlots
      cursor = outerCursor
    }
  }

  function flush() {
    if (flushing) return
    flushing = true
    try {
      let guard = 0
      while (dirty) {
        if (guard++ > 100) throw new Error('test harness: render did not settle')
        dirty = false
        renderOnce()
      }
    } finally {
      flushing = false
    }
  }

  const react = {
    useState(initial) {
      const index = cursor++
      if (slots.length <= index) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      const slot = slots[index]
      return [slot.value, (next) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (Object.is(value, slot.value)) return
        slot.value = value
        schedule()
      }]
    },
    useRef(initial) {
      const index = cursor++
      if (slots.length <= index) slots[index] = { current: initial }
      return slots[index]
    },
    useCallback(fn) {
      const index = cursor++
      // 槽位数组在渲染结束后会切回父组件：闭包必须自己抓住本组件的数组。
      const own = slots
      if (own.length <= index) own[index] = { fn }
      own[index].fn = fn
      return (...args) => own[index].fn(...args)
    },
    useId() {
      const index = cursor++
      if (slots.length <= index) slots[index] = { id: `r${index}` }
      return slots[index].id
    },
    useEffect(run, deps) {
      const index = cursor++
      const slot = slots[index] ?? (slots[index] = { deps: undefined, cleanup: undefined, run })
      const changed = slot.deps === undefined || deps === undefined
        || slot.deps.length !== deps.length
        || deps.some((dep, at) => !Object.is(dep, slot.deps[at]))
      slot.run = run
      slot.deps = deps
      if (changed) pending.push(slot)
    },
  }

  const element = (type, elementProps, key) => ({ type, props: elementProps ?? {}, key })
  const jsxRuntime = {
    Fragment: Symbol.for('react.fragment'),
    jsx: element,
    jsxs: element,
  }

  return {
    react,
    jsxRuntime,
    /** 挂载组件并返回第一棵树。 */
    render(component, initialProps) {
      Component = component
      props = initialProps
      componentSlots.clear()
      dirty = true
      flush()
      return tree
    },
    get tree() {
      return tree
    },
    /** 卸载：跑全部组件路径上仍登记的 effect 清理函数。 */
    unmount() {
      for (const list of componentSlots.values()) {
        for (const slot of list) {
          if (typeof slot?.cleanup === 'function') slot.cleanup()
        }
      }
    },
  }
}

/** 深度优先遍历元素树（只访问带 props 的元素节点）。 */
export function visit(node, fn) {
  if (Array.isArray(node)) {
    for (const child of node) visit(child, fn)
    return
  }
  if (node === null || typeof node !== 'object' || !('props' in node)) return
  fn(node)
  visit(node.props?.children, fn)
}

/** 收集所有 `type` 的元素。 */
export function findAll(tree, type) {
  const out = []
  visit(tree, (node) => {
    if (node.type === type) out.push(node)
  })
  return out
}

/** 取第一个 `type` 的元素。 */
export function findOne(tree, type) {
  const [first] = findAll(tree, type)
  return first
}

/** 元素子树里的文本（直接拼上字符串子节点）。 */
export function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return node && typeof node === 'object' ? text(node.props?.children) : ''
}

/** 表格主体里的行（`<tr>` 节点数组）。 */
export function bodyRows(tree) {
  const body = findOne(tree, 'tbody')
  if (body === undefined) return []
  const children = body.props?.children
  return (Array.isArray(children) ? children : [children]).filter((child) => child?.type === 'tr')
}

/** 一行的单元格（`<td>` 节点数组）。 */
export function cells(row) {
  const children = row.props?.children
  return (Array.isArray(children) ? children : [children]).filter((child) => child?.type === 'td')
}

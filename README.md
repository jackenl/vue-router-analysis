# 深入解读 VueRouter 源码

## 目录结构

```
src
├── components              # 路由组件（RouterView、RouterLink）
├── create-matcher.js       # route 匹配
├── create-route-map.js     # route 映射
├── history                 # 路由处理（路由切换、守卫触发）
├── index.js                # Router 入口
├── install.js              # Router 安装
└── util                    # 工具函数
```

## 应用实例

我们来看一个简单的 VueRouter 应用实例：

```js
// main.js
import Vue from 'vue'
import VueRouter form 'vue-router'
import App from './App'

Vue.use(VueRouter) // VueRouter 注册

const router = new VueRouter({
	routes: [
		{
      path: '/',
      name: 'Home',
      component: import('../views/Home.vue'),
    }
	]
})

new Vue({
	router, // router 对象注入
	render: h => h(App)
}).$mount('#app')
```

## VueRouter 注册

### Vue.use(plugin) 使用

通过应用实例，我们可以知道 VueRouter 注册调用了`Vue.use(VueRotuer)`，想要知道 VueRouter 是如何进行注册的，首先我们得清楚`Vue.use(plugin)`函数的定义。

```js
export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
```

可以发现`Vue.use(plugin)`函数最终会调用 plugin 插件的`install`方法进行应用注册，因此我们只需要分析 VueRouter 对象内部的`install`方法定义就可以知道 VueRouter 的整个注册流程是如何进行的。

### VueRouter 安装

```js
import View from './components/view'
import Link from './components/link'

// 使用模块局部变量保存 Vue 实例，减少作用域访问层数
export let _Vue

export function install (Vue) {
  // 防止重复安装
  if (install.installed && _Vue === Vue) return
  install.installed = true

  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    // 判断 vm 实例是否是 RouterView 组件
    // 并执行组件中的 registerRouteInstance 保存实例到匹配到的 route 对象中
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 通过 mixin 全局混入给每个 Vue Component 注入 router 和 route
  Vue.mixin({
    beforeCreate () {
      if (isDef(this.$options.router)) {
        // _routerRoot 指向根组件
        this._routerRoot = this
        this._router = this.$options.router
        // router 对象初始化
        this._router.init(this)
        // 对 _route 属性进行双向绑定
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // 注入路由组件实例
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  // 绑定 $router 和 $route 属性到 router 和 route
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 全局注册 RouterView 和 RouterLink 组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  // 令 route hook 都使用与 created 钩子一样的合并策略
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
```

## router 对象构造

```js
constructor (options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    // 创建路由匹配对象，通过 matcher 对象进行路由匹配
    this.matcher = createMatcher(options.routes || [], this)

    // 根据不同 mode 使用不同路由模式
    let mode = options.mode || 'hash'
    this.fallback =
      mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode

    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }
```

### router 对象初始化

```js
init (app: any /* Vue component instance */) {
  // 校验 VueRouter 是否已安装
  process.env.NODE_ENV !== 'production' &&
    assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
        `before creating root instance.`
    )

  // 保存组件实例
  this.apps.push(app)

  // set up app destroyed handler
  // https://github.com/vuejs/vue-router/issues/2639
  // 组件被销毁时从 apps 中移除该组件并重置 history
  app.$once('hook:destroyed', () => {
    // clean out app from this.apps array once destroyed
    const index = this.apps.indexOf(app)
    if (index > -1) this.apps.splice(index, 1)
    // ensure we still have a main app or null if no apps
    // we do not release the router so it can be reused
    if (this.app === app) this.app = this.apps[0] || null

    if (!this.app) this.history.teardown()
  })

  // main app previously initialized
  // return as we don't need to set up new history listener
  if (this.app) {
    return
  }

  this.app = app

  const history = this.history

  if (history instanceof HTML5History || history instanceof HashHistory) {
    const handleInitialScroll = routeOrError => {
      const from = history.current
      const expectScroll = this.options.scrollBehavior
      const supportsScroll = supportsPushState && expectScroll

      if (supportsScroll && 'fullPath' in routeOrError) {
        handleScroll(this, routeOrError, from, false)
      }
    }
    // 路由切换监听
    const setupListeners = routeOrError => {
      // 根据不同 history 模式监听路由切换进行对应模式的路由跳转
      history.setupListeners()
      // 页面滚动初始化
      handleInitialScroll(routeOrError)
    }
    // 路由跳转
    history.transitionTo(
      history.getCurrentLocation(),
      setupListeners,
      setupListeners
    )
  }

  // 路由切换监听
  history.listen(route => {
    this.apps.forEach(app => {
      // 替换当前 route 对象,触发路由组件替换
      app._route = route
    })
  })
}
```

## matcher 路由匹配

```js
export function createMatcher (
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {
  // 生成 path 队列、path路由映射和名称路由映射
  const { pathList, pathMap, nameMap } = createRouteMap(routes)
  
  ...
  
  return {
    match, // 路由匹配函数
    addRoute, // 动态添加路由规则函数
    getRoutes, // 获取路由记录列表函数
    addRoutes // 动态添加路由规则数组函数
  }
}
```

### match 路由匹配

```js
function match (
    raw: RawLocation,
    currentRoute?: Route,
    redirectedFrom?: Location
  ): Route {
    // 序列化 location
    const location = normalizeLocation(raw, currentRoute, false, router)
    const { name } = location

    // 获取映射路由记录，并获取返回对应的 route 对象
    if (name) {
      const record = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      if (!record) return _createRoute(null, location)

      // 提取 params 参数
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}
      }

      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      // 给 path 填充 params 参数
      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) {
      location.params = {}
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match
    return _createRoute(null, location)
  }
```

### addRoute 动态添加路由规则

```js
function addRoute (parentOrRoute, route) {
  const parent = (typeof parentOrRoute !== 'object') ? nameMap[parentOrRoute] : undefined
  // $flow-disable-line
  // 创建基于自身 path 的路由记录映射
  createRouteMap([route || parentOrRoute], pathList, pathMap, nameMap, parent)

  // add aliases of parent
  // 创建基于父级 alias 的路由记录映射
  if (parent) {
    createRouteMap(
      // $flow-disable-line route is defined if parent is
      parent.alias.map(alias => ({ path: alias, children: [route] })),
      pathList,
      pathMap,
      nameMap,
      parent
    )
  }
}
```

### getRoutes 路由记录获取

```js
function getRoutes () {
  return pathList.map(path => pathMap[path])
}
```

## routeMap 路由映射

```js
export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>,
  parentRoute?: RouteRecord
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  // the path list is used to control path matching priority
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  // path 或 alias 路由映射表
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  // 名称路由映射表
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // 给每一个 route 对象添加路由记录
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route, parentRoute)
  })

  // ensure wildcard routes are always at the end
  // 把通配符 path 移到队列尾部
  // 使通配符匹配为最后
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  // 检查 path 队列中是含有起始路径‘/’或通配符‘*’
  // 保证可以匹配到起始路由
  if (process.env.NODE_ENV === 'development') {
    // warn if routes do not include leading slashes
    const found = pathList
    // check for missing leading slash
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')

    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}
```

### addRouteRecord 添加路由记录

```js
function addRouteRecord (
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  const { path, name } = route
  // 校验配置参数合法性
  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )

    warn(
      // eslint-disable-next-line no-control-regex
      !/[^\u0000-\u007F]+/.test(path),
      `Route with path "${path}" contains unencoded characters, make sure ` +
        `your path is correctly encoded before passing it to the router. Use ` +
        `encodeURI to encode static segments of your path.`
    )
  }
  // 正则匹配规则参数
  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}
  // 序列化 path
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  // 匹配规则是否大小写敏感
  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  // 生成记录对象
  const record: RouteRecord = {
    path: normalizedPath,
    // 生成 path 正则匹配表达式
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    components: route.components || { default: route.component },
    alias: route.alias
      ? typeof route.alias === 'string'
        ? [route.alias]
        : route.alias
      : [],
    instances: {},
    enteredCbs: {},
    name,
    parent,
    matchAs,
    redirect: route.redirect,
    beforeEnter: route.beforeEnter,
    meta: route.meta || {},
    props:
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props }
  }
  
  ...
 }
```

#### 创建嵌套路由记录

```js
if (route.children) {
  // Warn if route is named, does not redirect and has a default child route.
  // If users navigate to this route by name, the default child will
  // not be rendered (GH Issue #629)
  // 校验嵌套路由规则合法性
  if (process.env.NODE_ENV !== 'production') {
    if (
      route.name &&
      !route.redirect &&
      route.children.some(child => /^\/?$/.test(child.path))
    ) {
      warn(
        false,
        `Named Route '${route.name}' has a default child route. ` +
          `When navigating to this named route (:to="{name: '${
            route.name
          }'"), ` +
          `the default child route will not be rendered. Remove the name from ` +
          `this route and use the name of the default child route for named ` +
          `links instead.`
      )
    }
  }
  // 给嵌套路由规则添加路由记录
  route.children.forEach(child => {
    const childMatchAs = matchAs
      ? cleanPath(`${matchAs}/${child.path}`)
      : undefined
    addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
  })
}
```

#### 创建路由记录映射

##### 基于 path 路由记录映射

```js
// 添加基于 path 路由记录映射
if (!pathMap[record.path]) {
  pathList.push(record.path)
  pathMap[record.path] = record
}

// 给 alias 创建路由记录并添加到基于 path 路由记录映射集合
if (route.alias !== undefined) {
  const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]
  for (let i = 0; i < aliases.length; ++i) {
    const alias = aliases[i]
    if (process.env.NODE_ENV !== 'production' && alias === path) {
      warn(
        false,
        `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`
      )
      // skip in dev to make it work
      continue
    }

    const aliasRoute = {
      path: alias,
      children: route.children
    }
    addRouteRecord(
      pathList,
      pathMap,
      nameMap,
      aliasRoute,
      parent,
      record.path || '/' // matchAs
    )
  }
}
```

##### 基于 name 路由记录映射

```js
// 添加基于 name 路由记录映射
if (name) {
  if (!nameMap[name]) {
    nameMap[name] = record
  } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
    warn(
      false,
      `Duplicate named routes definition: ` +
        `{ name: "${name}", path: "${record.path}" }`
    )
  }
}
```

## 路由切换

### transitionTo 导航切换

```js
export class History {
  ...
  
  listen (cb: Function) {
    // 设置路由切换监听回调
    this.cb = cb
  }
	
	transitionTo (
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {
    let route
    // catch redirect option https://github.com/vuejs/vue-router/issues/3201
    try {
      // 获取匹配 route 对象
      route = this.router.match(location, this.current)
    } catch (e) {
      this.errorCbs.forEach(cb => {
        cb(e)
      })
      // Exception should still be thrown
      throw e
    }
    // 缓存当前 route 对象,用作导航守卫 from 传参
    const prev = this.current
    // 触发导航守卫
    this.confirmTransition(
      route,
      () => {
        // 更新 route 对象
        this.updateRoute(route)
        onComplete && onComplete(route)
        // 更新 url
        this.ensureURL()
        // 触发 afterEach 导航守卫
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        // fire ready cbs once
        // 完成后只执行一次 onReady 回调
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => {
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) {
          // Initial redirection should not mark the history as ready yet
          // because it's triggered by the redirection instead
          // https://github.com/vuejs/vue-router/issues/3225
          // https://github.com/vuejs/vue-router/issues/3331
          if (!isNavigationFailure(err, NavigationFailureType.redirected) || prev !== START) {
            this.ready = true
            this.readyErrorCbs.forEach(cb => {
              cb(err)
            })
          }
        }
      }
    )
  }
	...

  updateRoute (route: Route) {
    this.current = route
    // 执行路由切换监听回调
    this.cb && this.cb(route)
  }
}
```

### 路由跳转

```js
/* index.js */
// 路由切换监听
history.listen(route => {
  this.apps.forEach(app => {
    // 替换当前 route 对象,触发路由组件替换
    app._route = route
  })
})
```

## 导航守卫

### 导航守卫注册

#### 全局导航守卫注册

```js
/* index.js */
export default class VueRouter {
  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }

  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }

  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }
}

function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}
```

#### 组件导航守卫注册

获取导航守卫钩子

```js
function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    // 获取组件对应的钩子
    const guard = extractGuard(def, name)
    if (guard) {
      // bind 函数实际是 bindGuard 函数
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  // 数组扁平化，同时判断是否翻转数组
  // beforeRouteLeave 钩子需要从子到父执行
  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}
```

beforeRouteLeave 导航守卫获取

```js
function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}
```

beforeRouteUpdate 导航守卫获取

```js
function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}
```

beforeRouteEnter 导航守卫获取

```js
function extractEnterGuards (
  activated: Array<RouteRecord>
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key)
    }
  )
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      // 把 beforeRouteEnter 守卫回调插入路由记录对象的 enteredCbs 属性中
      // 用于路由组件挂载完成后执行
      if (typeof cb === 'function') {
        if (!match.enteredCbs[key]) {
          match.enteredCbs[key] = []
        }
        match.enteredCbs[key].push(cb)
      }
      next(cb)
    })
  }
}
```

其中 beforeRouteLeave 和 beforeRouteUpdate 导航守卫钩子函数中可以访问组件实例`this`

组件导航守卫如何实现通过 this 指针访问组件实例：

1. 首先获取匹配路由记录对应的组件实例

```js
export function flatMapComponents (
  matched: Array<RouteRecord>,
  fn: Function
): Array<?Function> {
  return flatten(matched.map(m => {
    return Object.keys(m.components).map(key => fn(
      m.components[key],
      m.instances[key],
      m, key
    ))
  }))
}

// 数组扁平化
export function flatten (arr: Array<any>): Array<any> {
  return Array.prototype.concat.apply([], arr)
}
```

2. 通过函数柯里化将组件导航守卫绑定到的对应组件实例进行执行

```js
// extractGuards funciton
flatMapComponents(records, (def, instance, match, key) => {
  // 获取组件对应的钩子
  const guard = extractGuard(def, name)
  if (guard) {
    // bind 函数实际是 bindGuard 函数
    return Array.isArray(guard)
      ? guard.map(guard => bind(guard, instance, match, key))
      : bind(guard, instance, match, key)
  }
})

function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}
```

beforeRouteEnter 守卫 **不能** 访问 `this`，因为守卫在导航确认前被调用，对应的组件实例尚未被创建，所以 beforeRouteEnter  守卫无法通过`this`指针获取组件实例。

但是，可以通过传一个回调给 `next`来访问组件实例。在导航被确认的时候执行回调，并且把组件实例作为回调方法的参数。

```js
runQueue(queue, iterator, () => {
  if (this.pending !== route) {
    return abort(createNavigationCancelledError(current, route))
  }
  this.pending = null
  onComplete(route) // 触发路由切换监听
  if (this.router.app) {
    /* 注意: 在组件实例被创建后再将实例变量vm传参给 beforeRouteEnter 钩子的 next 回调执行 */
    // 使是唯一可以通过 next 回调获取组件实例的钩子
    this.router.app.$nextTick(() => {
      handleRouteEntered(route)
    })
  }
})
```

在导航守卫队列执行完毕的回调中，通过`this.router.app.$nextTick`函数将`beforeRouteEnter`守卫的`next`回调执行延迟到对应组件在下次 DOM 更新循环结束之后（即组件创建过后），然后通过`handleRouteEntered`函数获取对应`routeRecord`的组件实例，并将组件实例传作守卫`next`回调的首参执行。

```js
export function handleRouteEntered (route: Route) {
  for (let i = 0; i < route.matched.length; i++) {
    const record = route.matched[i]
    for (const name in record.instances) {
      const instance = record.instances[name]
      const cbs = record.enteredCbs[name]
      if (!instance || !cbs) continue
      delete record.enteredCbs[name]
      for (let i = 0; i < cbs.length; i++) {
        // 给 beforeRouteEnter 钩子next回调传递组件实例参数
        // 使next回调函数能够访问组件实例
        if (!instance._isBeingDestroyed) cbs[i](instance)
      }
    }
  }
}
```

### 导航守卫执行

```js
confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
  const current = this.current
  this.pending = route
  // 路由跳转中断
  const abort = err => {
    // changed after adding errors with
    // https://github.com/vuejs/vue-router/pull/3047 before that change,
    // redirect and aborted navigation would produce an err == null
    if (!isNavigationFailure(err) && isError(err)) {
      if (this.errorCbs.length) {
        this.errorCbs.forEach(cb => {
          cb(err)
        })
      } else {
        warn(false, 'uncaught error during route navigation:')
        console.error(err)
      }
    }
    onAbort && onAbort(err)
  }
  const lastRouteIndex = route.matched.length - 1
  const lastCurrentIndex = current.matched.length - 1
  // 相同路由中断路由跳转
  if (
    isSameRoute(route, current) &&
    // in the case the route map has been dynamically appended to
    lastRouteIndex === lastCurrentIndex &&
    route.matched[lastRouteIndex] === current.matched[lastCurrentIndex]
  ) {
    this.ensureURL()
    return abort(createNavigationDuplicatedError(current, route))
  }

  // 对比匹配路由列表，筛选出可复用组件路由、失活组件路由、当前激活组件路由
  const { updated, deactivated, activated } = resolveQueue(
    this.current.matched,
    route.matched
  )

  // 导航守卫队列
  const queue: Array<?NavigationGuard> = [].concat(
    // in-component leave guards
    // 失活组件 beforeLeave 钩子
    extractLeaveGuards(deactivated),
    // global before hooks
    // 全局 beforeEach 钩子
    this.router.beforeHooks,
    // in-component update hooks
    // 可复用组件 beforeUpdate 钩子
    extractUpdateHooks(updated),
    // in-config enter guards
    // 激活组件 beforeEnter 钩子
    activated.map(m => m.beforeEnter),
    // async components
    // 解析异步路由组件
    resolveAsyncComponents(activated)
  )

  // 导航守卫钩子执行迭代器
  const iterator = (hook: NavigationGuard, next) => {
    // 防止之前的路由跳转尚未完成影响当前的路由跳转
    if (this.pending !== route) {
      return abort(createNavigationCancelledError(current, route))
    }
    try {
      hook(route, current, (to: any) => {
        // 判断 next() 传参
        if (to === false) {
          // next(false) -> abort navigation, ensure current URL
          this.ensureURL(true)
          abort(createNavigationAbortedError(current, route))
        } else if (isError(to)) {
          this.ensureURL(true)
          abort(to)
        } else if (
          typeof to === 'string' ||
          (typeof to === 'object' &&
            (typeof to.path === 'string' || typeof to.name === 'string'))
        ) {
          // next('/') or next({ path: '/' }) -> redirect
          abort(createNavigationRedirectedError(current, route))
          if (typeof to === 'object' && to.replace) {
            this.replace(to)
          } else {
            this.push(to)
          }
        } else {
          // confirm transition and pass on the value
          // 执行下一个步骤器 step(index + 1)
          next(to)
        }
      })
    } catch (e) {
      abort(e)
    }
  }

  // 异步钩子队列同步执行
  runQueue(queue, iterator, () => {
    // wait until async components are resolved before
    // extracting in-component enter guards
    // 异步组件解析完成
    // 获取渲染组件 beforeRouteEnter 钩子
    const enterGuards = extractEnterGuards(activated)
    // 合并全局解析守卫
    const queue = enterGuards.concat(this.router.resolveHooks)
    runQueue(queue, iterator, () => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      this.pending = null
      onComplete(route) // 触发路由切换监听
      if (this.router.app) {
        /* 注意: 在组件实例被创建后再将实例变量vm传参给 beforeRouteEnter 钩子的 next 回调执行 */
        // 使是唯一可以通过 next 回调获取组件实例的钩子
        this.router.app.$nextTick(() => {
          handleRouteEntered(route)
        })
      }
    })
  })
}
```

afterEach 导航守卫执行

```js
this.confirmTransition(
  route,
  () => {
  	...
    // 触发 afterEach 导航守卫
    this.router.afterHooks.forEach(hook => {
      hook && hook(route, prev)
    })
    ...
  },
  ...
}
```

异步导航守卫钩子同步执行实现

```js
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  const step = index => {
    if (index >= queue.length) {
      cb()
    } else {
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        step(index + 1)
      }
    }
  }
  step(0)
}
```

解析异步组件

```js
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
  return (to, from, next) => {
    let hasAsync = false
    let pending = 0
    let error = null

    flatMapComponents(matched, (def, _, match, key) => {
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      // 判断是否异步组件
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true
        pending++

        // 组件导入成功回调
        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) {
            resolvedDef = resolvedDef.default
          }
          // save resolved on async factory in case it's used elsewhere
          // 判断是否是构造函数(渲染函数)
          // 如果不是则通过Vue.extend生成渲染函数
          def.resolved = typeof resolvedDef === 'function'
            ? resolvedDef
            : _Vue.extend(resolvedDef)
          // 赋值到组件集合
          match.components[key] = resolvedDef
          pending--
          // 等待所有异步组件解析完成,继续下一步
          if (pending <= 0) {
            next()
          }
        })
        // 组件导入失败回调
        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`
          process.env.NODE_ENV !== 'production' && warn(false, msg)
          if (!error) {
            error = isError(reason)
              ? reason
              : new Error(msg)
            next(error)
          }
        })

        let res
        try {
          // 执行异步组件函数
          res = def(resolve, reject)
        } catch (e) {
          reject(e)
        }
        // 如果有子组件,继续执行then
        if (res) {
          if (typeof res.then === 'function') {
            res.then(resolve, reject)
          } else {
            // new syntax in Vue 2.3
            const comp = res.component
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    // 如果不是异步组件直接下一步
    if (!hasAsync) next()
  }
}
```

## history 模式

### hash 模式

```js
constructor (router: Router, base: ?string, fallback: boolean) {
  super(router, base)
  // check history fallback deeplinking
  // 当浏览器不支持 history.pushState 控制路由是否应该回退到 hash 模式
  if (fallback && checkFallback(this.base)) {
    return
  }
  // 保证 hash 值以/开头，如果没有则开头添加/
  ensureSlash()
}
```

设置 popstate 或 hashchange 事件监听，触发路由切换，替换导航 hash 值

```js
const handleRoutingEvent = () => {
  const current = this.current
  if (!ensureSlash()) {
    return
  }
  this.transitionTo(getHash(), route => {
    if (supportsScroll) {
      handleScroll(this.router, route, current, true)
    }
    if (!supportsPushState) {
      replaceHash(route.fullPath)
    }
  })
}
const eventType = supportsPushState ? 'popstate' : 'hashchange'
window.addEventListener(
  eventType,
  handleRoutingEvent
)
this.listeners.push(() => {
  window.removeEventListener(eventType, handleRoutingEvent)
})
```

### html5 模式

```js
constructor (router: Router, base: ?string) {
  super(router, base)

  // 获取起始url
  this._startLocation = getLocation(this.base)
}
```

设置 popstate 事件监听，触发路由切换

```js
const handleRoutingEvent = () => {
  const current = this.current

  // Avoiding first `popstate` event dispatched in some browsers but first
  // history route not updated since async guard at the same time.
  const location = getLocation(this.base)
  if (this.current === START && location === this._startLocation) {
    return
  }

  this.transitionTo(location, route => {
    if (supportsScroll) {
      handleScroll(router, route, current, true)
    }
  })
}
window.addEventListener('popstate', handleRoutingEvent)
this.listeners.push(() => {
  window.removeEventListener('popstate', handleRoutingEvent)
})
```

### abstract 模式

通过数组和索引实现 history 抽象

## 路由组件

### RouterView 组件

```js
render (_, { props, children, parent, data }) {
  // used by devtools to display a router-view badge
  data.routerView = true

  // directly use parent context's createElement() function
  // so that components rendered by router-view can resolve named slots
  const h = parent.$createElement
  const name = props.name
  const route = parent.$route
  // 通过父组件上下文的 createElement 函数创建组件实例
  // 将组件实例缓存在父组件实例中的 _routerViewCache 属性中
  const cache = parent._routerViewCache || (parent._routerViewCache = {})

  // determine current view depth, also check to see if the tree
  // has been toggled inactive but kept-alive.
  // 由 router-view 组件向上遍历直到根组件，计算组件深度
  // 目的用于获取匹配 routeRecord 对象上的组件构建函数
  let depth = 0
  let inactive = false
  while (parent && parent._routerRoot !== parent) {
    const vnodeData = parent.$vnode ? parent.$vnode.data : {}
    if (vnodeData.routerView) {
      depth++
    }
    if (vnodeData.keepAlive && parent._directInactive && parent._inactive) {
      inactive = true
    }
    parent = parent.$parent
  }
  data.routerViewDepth = depth

  // render previous view if the tree is inactive and kept-alive
  // 渲染 keepAlive 缓存组件
  if (inactive) {
    const cachedData = cache[name]
    const cachedComponent = cachedData && cachedData.component
    if (cachedComponent) {
      // #2301
      // pass props
      if (cachedData.configProps) {
        fillPropsinData(cachedComponent, data, cachedData.route, cachedData.configProps)
      }
      // 直接渲染缓存的组件实例
      return h(cachedComponent, data, children)
    } else {
      // render previous empty view
      return h()
    }
  }

  const matched = route.matched[depth]
  const component = matched && matched.components[name]

  // render empty node if no matched route or no config component
  if (!matched || !component) {
    cache[name] = null
    return h()
  }

  // cache component
  cache[name] = { component }

  // attach instance registration hook
  // this will be called in the instance's injected lifecycle hooks
  data.registerRouteInstance = (vm, val) => {
    // val could be undefined for unregistration
    const current = matched.instances[name]
    if (
      (val && current !== vm) ||
      (!val && current === vm)
    ) {
      // 将组件实例注入到对应 routeRecord 对象上的 instances 属性上
      matched.instances[name] = val
    }
  }

  // also register instance in prepatch hook
  // in case the same component instance is reused across different routes
  ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => {
    matched.instances[name] = vnode.componentInstance
  }

  // register instance in init hook
  // in case kept-alive component be actived when routes changed
  data.hook.init = (vnode) => {
    if (vnode.data.keepAlive &&
      vnode.componentInstance &&
      vnode.componentInstance !== matched.instances[name]
    ) {
      matched.instances[name] = vnode.componentInstance
    }

    // if the route transition has already been confirmed then we weren't
    // able to call the cbs during confirmation as the component was not
    // registered yet, so we call it here.
    handleRouteEntered(route)
  }

  const configProps = matched.props && matched.props[name]
  // save route and configProps in cache
  if (configProps) {
    extend(cache[name], {
      route,
      configProps
    })
    fillPropsinData(component, data, route, configProps)
  }

  // 渲染组件
  return h(component, data, children)
}
```

### RouterLink 组件

设置 active 路由样式

```js
render (h: Function) {
	...
	const activeClassFallback =
      globalActiveClass == null ? 'router-link-active' : globalActiveClass
    const exactActiveClassFallback =
      globalExactActiveClass == null
        ? 'router-link-exact-active'
        : globalExactActiveClass
    const activeClass =
      this.activeClass == null ? activeClassFallback : this.activeClass
    const exactActiveClass =
      this.exactActiveClass == null
        ? exactActiveClassFallback
        : this.exactActiveClass
        ...
}
```

切换路由触发对应路由监听事件

```js
const handler = e => {
  if (guardEvent(e)) {
    if (this.replace) {
      router.replace(location, noop)
    } else {
      router.push(location, noop)
    }
  }
}
```


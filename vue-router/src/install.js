import View from './components/view'
import Link from './components/link'

export let _Vue // 使用模块局部变量保存 Vue 实例，减少作用域访问层数

export function install (Vue) {
  // 已经安装
  if (install.installed && _Vue === Vue) return
  install.installed = true

  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    // 判断 vm 是否是 RouterView 组件，如果是则执行 registerRouteInstance 函数
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 通过 mixin 全局混入给每个 Vue Component 注入路由对象
  // 并通过 RouterView 组件注册、销毁路由组件实例
  Vue.mixin({
    beforeCreate () {
      // 对根组件进行路由初始化，令所有组件 _routerRoot 属性指向根组件
      if (isDef(this.$options.router)) {
        this._routerRoot = this
        this._router = this.$options.router
        // router 对象初始化
        this._router.init(this)
        // 对 _route 属性进行双向绑定
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // 注册路由实例
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  // 绑定 $router 和 $route 属性到 router 对象和当前 route 对象
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 注册全局组件 RouterView 和 RouterLink
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  // 令 route hook 都使用与 created hook 一样的 option 合并策略
  // 触发合并策略有 Vue.component 和 extends 、mixin
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}

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

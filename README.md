# 深入解读 VueRouter 源码

## 目录结构

```
src
├── components
├── create-matcher.js
├── create-route-map.js
├── history
├── index.js
├── install.js
└── util
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
	router, // router 对象插入
	render: h => h(App)
}).$mount('#app')
```

```html
// App.Vue
<template>
  <router-view/> // 路由组件注册
</template>
```



## VueRouter 注册

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

```js
// install.js
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
      if (isDef(this.$options.router)) {
        // 根组件路由对象注入
        this._routerRoot = this
        this._router = this.$options.router
        this._router.init(this)
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 子组件路由对象注入，最终指向根组件的路由对象
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  // 通过 Object.defineProperty 代理 Vue.prototype.$router 到 Vue 实例内部变量 _routerRoot._router 上
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })
  // 通过 Object.defineProperty 代理 Vue.prototype.$route 到 Vue 实例内部变量 _routerRoot._route 上
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
```



## VueRouter 对象构造



## matcher 对象构造



## 路由模式



## RouterView、RouterLink 组件
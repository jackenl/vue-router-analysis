/* @flow */
/**
 * 同步执行异步函数队列
 * @param {*} queue 异步函数队列
 * @param {*} fn 迭代器函数
 * @param {*} cb 异步函数执行结果回调
 */
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

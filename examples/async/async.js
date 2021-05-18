function asyncQueue(queue, fn, cb) {
  const step = (index) => {
    if (index >= queue.length) {
      cb();
    } else {
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1);
        });
      } else {
        step(index + 1);
      }
    }
  };
  step(0);
}

function iterator(hook, next) {
  hook((val) => {
    console.log(val);
    next(); // 实际调用 step(index + 1)
  });
}

function hook1(next) {
  console.log('hook1 start');
  next('hook1 end');
}
function hook2(next) {
  console.log('hook2 start');
  next('hook2 end');
}
function hook3(next) {
  console.log('hook3 start');
  next('hook3 end');
}
let hookQueue = [hook1, hook2, hook3];

asyncQueue(hookQueue, iterator, () => {
  console.log('all hook end');
});

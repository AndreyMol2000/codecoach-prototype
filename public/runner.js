import { execute } from './runner-core.js';

export function runCode(code, task, timeout = 1800) {
  return new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    const token = crypto.randomUUID();
    const workerSource = `const execute = ${execute.toString()}; onmessage = e => postMessage(execute(e.data.code, e.data.task));`;
    const payload = JSON.stringify({ code, task, workerSource, token }).replaceAll('<', '\\u003c');
    let timer;
    const finish = result => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove();
      resolve(result);
    };
    const onMessage = event => {
      if (event.source === frame.contentWindow && event.data?.token === token) finish(event.data.result);
    };
    window.addEventListener('message', onMessage);
    // Unique opaque origin + restrictive CSP. User code never executes in the app's origin or on the server.
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'"><script>
      const data = ${payload};
      let worker;
      function send(result) { if (worker) worker.terminate(); parent.postMessage({token: data.token, result}, '*'); }
      try {
        const url = URL.createObjectURL(new Blob([data.workerSource], {type:'text/javascript'}));
        worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = e => send(e.data);
        worker.onerror = () => send({kind:'runtime', error:'Ошибка выполнения. Проверьте синтаксис и возвращаемое значение.', results:[]});
        worker.postMessage({code:data.code, task:data.task});
        setTimeout(() => send({kind:'timeout', error:'Выполнение остановлено: превышен лимит времени. Проверьте условие выхода из цикла.', results:[]}), ${timeout});
      } catch (e) { send({kind:'runtime', error:'Браузер не смог запустить проверку: '+e.message, results:[]}); }
    <\/script>`;
    timer = setTimeout(() => finish({ kind: 'timeout', error: 'Проверка не ответила. Попробуйте ещё раз или обновите браузер.', results: [] }), timeout + 2000);
    document.body.append(frame);
  });
}

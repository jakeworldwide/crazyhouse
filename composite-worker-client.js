export function createCompositeWorker(){
 const worker=new Worker(new URL('./composite-worker.js?v=5',import.meta.url),{type:'module'});
 const requests=new Map();let serial=0,disposed=false;
 worker.onmessage=({data})=>{const request=requests.get(data.id);if(!request)return;requests.delete(data.id);data.error?request.reject(new Error(data.error)):request.resolve(data);};
 worker.onerror=event=>{for(const request of requests.values())request.reject(new Error(event.message||'Composite worker failed'));requests.clear();};
 return {
  call(kind,payload,transfer=[]){if(disposed)return Promise.reject(new Error('Composite worker disposed'));return new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});worker.postMessage({id,kind,...payload},transfer);});},
  dispose(){disposed=true;worker.terminate();for(const request of requests.values())request.reject(new Error('Composite worker disposed'));requests.clear();}
 };
}

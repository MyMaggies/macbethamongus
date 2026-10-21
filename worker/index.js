// Tiny test Worker: GET / says hello, /ws echoes WebSocket messages.
const CORS={'access-control-allow-origin':'*'};
export default {
  async fetch(req){
    const url=new URL(req.url);
    if(url.pathname==='/ws'&&req.headers.get('Upgrade')==='websocket'){
      const pair=new WebSocketPair();const [client,server]=Object.values(pair);
      server.accept();
      server.addEventListener('message',e=>server.send(e.data));
      return new Response(null,{status:101,webSocket:client});
    }
    return new Response('worker ok',{headers:CORS});
  }
};

const configs = require(__dirname + '/_configs');
const vars = configs.getVars();

const mysql = require('mysql');
const mysql_conf = {  
  host     : vars.BD_HOST,
  user     : vars.BD_USER,
  password : vars.BD_PASSWORD,
  database : vars.BD_DATABASE
}

const ws_server = require('ws').Server;
const server_port = 8002;
const wss = new ws_server({clientTracking: true, port: server_port});

var srvr = {
    id:0,
    clients: []
};

wss.on('connection', function(ws){

    ws.id = srvr.id++;
    srvr.clients.push(ws);
    log('entrou: '+ws.id);
    log('total clientes:'+srvr.clients.length);

    ws.on('message', function (msg) {
    });

    ws.on('close',function(){
        flag = false;
        for(i in srvr.clients){
            if(srvr.clients[i].id == ws.id){
                log('saiu: '+srvr.clients[i].id);
                srvr.clients.splice(i,1);
                log('total clientes:'+srvr.clients.length);
            }
        }
    });

    ws.on('error',function(){
    });

});

log = (msg) => {
    console.log(msg);
};

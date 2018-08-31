const env = require(__dirname + '/../_configs');
const ut = require(__dirname + '/../utils');
const db = require(__dirname + '/../mods/database');

const moment = require("moment");

const ws_server = require('ws').Server;
const wss = new ws_server({clientTracking: true, port: env.WSS_PORT});

//INIT --------------------------------

    ut.log("WSS STARTED");

    var srvr = {
        id:0,
        clients: [],
        users: [],
        exchanges: {}
    };

    db.query("SELECT * FROM exchange", function(rows){
        if(rows.length > 0){
            rows.forEach(function(res, i){
                srvr.exchanges[res.slug] = {};
            });
        }
    });



//HANDLERS ----------------------------

    wss.on('connection', function(ws){

        ws.id = srvr.id++;
        ws.hskey = makeid();
        srvr.clients.push(ws);
        ut.log('new client: '+ws.id);
        //ut.log('total clients:'+srvr.clients.length);

        ws.on('message', function (msg) {
            let obj = JSON.parse(msg);
            if(obj.request=="browser" && obj.handshake==1){
                ws.send('{"handshake":1,"hskey":"'+ws.hskey+'"}');
            }else if(obj.request=="browser" && obj.auth == 1){
                userLoginRequest(obj);
            }else if(obj.request=="bitfinex_ws"){
                for(var exchange in srvr.exchanges){
                    if(exchange == "bitfinex"){
                        srvr.exchanges[exchange][obj.pair] = obj.pairs;
                        obj.pairs.strategies.forEach(function(strat, i){
                            srvr.users.forEach(function(user, j){
                                if(srvr.users[j].user_id == strat.user_id){
                                    srvr.users[j].send('{"update":1,"price":'+obj.pairs.price+',"pair":"'+obj.pair+'"}');
                                }
                            });
                        });
                    }
                }
            }

        });

        ws.on('close',function(){
            flag = false;
            for(i in srvr.clients){
                if(srvr.clients[i].id == ws.id){
                    ut.log('client logged out: '+srvr.clients[i].id);
                    srvr.clients.splice(i,1);
                    ut.log('total clients conneced:'+srvr.clients.length);
                }
            }
            for(i in srvr.users){
                if(srvr.users[i].id == ws.id){
                    ut.log('user logged out: '+srvr.users[i].id);
                    srvr.users.splice(i,1);
                    ut.log('total users connected:'+srvr.users.length);
                }
            }
        });

        ws.on('error',function(){
            ut.log("WSS ERROS");
        });

    });

    bfx = () => {

        const exec = require('child_process').exec;
        const bitfinex_ws = exec('node '+env.APP_DIR+'bitfinex_websocket.js');
        bitfinex_ws.stdout.on('data', function(data) {
            console.log(data);
        });
        bitfinex_ws.stderr.on('data', function(data) {
            console.log(data);
        });
        bitfinex_ws.on('close', function(code) {
            console.log(code);
        });

    }

    bfx();


// UTILS ------------------------------

    makeid = () => {
      var text = "";
      var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

      for (var i = 0; i < 32; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

      return text;
    }

    function broadCast(msg){

    }
    function sendMsgToClient(msg){

    }


// USERS ------------------------------

    userLoginRequest = (obj) => {
        let cli = getClientIndexByHskey(obj.hskey);
        if(cli !== false && obj.hskey == srvr.clients[cli].hskey){
            srvr.clients[cli].pass = obj.key;
            srvr.clients[cli].email = obj.email;
            srvr.clients[cli].auth = 0;
            srvr.clients[cli].moment = moment().unix();
            srvr.users.push(srvr.clients[cli]);
            db.query('SELECT * FROM user WHERE email = "'+obj.email+'" AND pass = "'+obj.key+'"', function(rows){
                if(rows.length){
                    rows.forEach(function(res, i){
                        let u = getUserByEmail(res.email);
                        let strats = JSON.stringify(getStrategiesFromUser(res.id));
                        srvr.users[u].user_id = res.id;
                        srvr.users[u].email = res.email;
                        srvr.users[u].auth_key = makeid();
                        srvr.users[u].auth = 1;
                        srvr.users[u].send('{"auth":1, "auth_key":"'+srvr.users[u].auth_key+'", "strategies":'+strats+'}');
                    });
                }
            });
        }
    }

    removeUnloggedUsers = () => {
        //remove all users not logged in after 20 seconds from login request
        let dif = 0;
        for(i in srvr.users){
            dif = moment().unix() - srvr.users[i].moment;
            if(srvr.users[i].auth == 0 && dif > 20){
                srvr.users.splice(i,1);
                ut.log("dumpin user "+srvr.users[i].id);
            }
        }
    }
    setInterval(removeUnloggedUsers, 10000);

    getUserByEmail = (email) => {
        for(i in srvr.users){
            if(srvr.users[i].email == email){
                return i;
            }
        }
    }

    getStrategiesFromUser = (user_id) => {
        let user_strategies = [];
        for(let exchange in srvr.exchanges){
            for(let pair in srvr.exchanges[exchange]){
                for(let strat in srvr.exchanges[exchange][pair].strategies){
                    ut.log(exchange+"."+pair+".strategies["+strat+"]:"+srvr.exchanges[exchange][pair].strategies[strat]);
                    if(srvr.exchanges[exchange][pair].strategies[strat].user_id == user_id){
                        srvr.exchanges[exchange][pair].strategies[strat].price = srvr.exchanges[exchange][pair].price;
                        user_strategies.push(srvr.exchanges[exchange][pair].strategies[strat]);
                    }
                }
            }
        }
        return user_strategies;
    }


// CLIENTS ----------------------------

    getClient = (id) => {
        for(i in srvr.clients){
            if(srvr.clients[i].id == id){
                return i;
            }
        }
    }

    getClientIndexByHskey = (key) => {
        let res = false;
        for(i in srvr.clients){
            if(srvr.clients[i].hskey == key){
                res = i;
            }
        }
        return res;
    }


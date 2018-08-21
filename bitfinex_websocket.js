require('dotenv').config();
const crypto = require('crypto-js');
const WebSocket = require('ws');
const moment = require('moment');
const fs = require('fs');
const env = JSON.parse(fs.readFileSync("env.json"));

const mysql = require('mysql');
const mysql_conf = {  
  host     : env.BD_HOST,
  user     : env.BD_USER,
  password : env.BD_PASSWORD,
  database : env.BD_DATABASE
}
var mysql_conn = "";

var users = []
var messages = {};
var pairs = {};
var pairPrices = {};
var channels = [];

mysql_conn = mysql.createConnection(mysql_conf);
mysql_conn.connect();
mysql_conn.query('SELECT CONCAT(c.slug,b.slug) pair, a.id, a.user_id, d.strategyTrading, a.buy, a.stop, a.target, a.buyFlag FROM strategy a INNER JOIN currency b ON a.currency_id = b.id INNER JOIN asset c ON a.asset_id = c.id INNER JOIN user d ON a.user_id = d.id WHERE b.exchanges_id = 1 ORDER BY a.created_at', function(err, rows, fields) {
    if(rows.length > 0){
        rows.forEach(function(res, i){

            //controle de usuário
            pushUser(res.user_id,res.strategyTrading);


            //separa stratégias por pares
            if(!pairs.hasOwnProperty(res.pair)){
                pairs[res.pair] = {};
                pairs[res.pair].strategies = [];
                pairs[res.pair].price = 0;
                pairs[res.pair].priceMoves = 0;
                pairs[res.pair].channel = 0;

            }
            pairs[res.pair].strategies.push(res);

        });
    }

    mysql_conn.end();
});


const wss = new WebSocket('wss://api.bitfinex.com/ws/2');

wss.onmessage = (msg) => {
    //console.log(msg.data);
    messages = JSON.parse(msg.data);

    //SUBSCRIPTIONS
    if(messages.event == "subscribed"){
        channels.push(messages);
        if(pairs.hasOwnProperty(messages.pair)){
            pairs[messages.pair].channel = messages.chanId;
            console.log(moment().format("YYYY-MM-DD H:mm:ss")+" subscribed "+messages.pair+" into channel #"+messages.chanId);
        }
    }

    //PRICES
    if(Array.isArray(messages[1])){
        priceChanges(messages[0],messages[1][0][3]);
    }
    if(messages[1] == "te"){
        priceChanges(messages[0],messages[2][3]);
    }

};
wss.onopen = () => {
    // API keys setup here (See "Authenticated Channels")
    const apiKey = process.env.BITFINEX_APIKEY;
    const apiSecret = process.env.BITFINEX_APISECRET;

    const authNonce = Date.now() * 1000;
    const authPayload = 'AUTH' + authNonce;
    const authSig = crypto
        .HmacSHA384(authPayload, apiSecret)
        .toString(crypto.enc.Hex)

    const payload = {
        apiKey,
        authSig,
        authNonce,
        authPayload,
        //dms: 4, uncomment to enable dead-man-switch
        event: 'auth'
    };

    for(var prop in pairs){
        console.log(moment().format("YYYY-MM-DD H:mm:ss")+" sending subscription request for "+prop);
        wss.send(JSON.stringify({ 
            event: 'subscribe', 
            channel: 'trades', 
            symbol: 't'+prop 
        }));
    }

};

pushUser = (user_id,strategyTrading) => {
    let flag = 0;
    for(let i=(users.length-1); i>=0; i--){
        if(users[i].id == user_id){
            flag = 1;
            i = -1;
        }
    }
    if(!flag){
        users.push({"id":user_id,"strategyTrading":strategyTrading});
    }
};

isUserTrading = (user_id) => {
    for(let i=(users.length-1); i>=0; i--){
        if(users[i].id == user_id){
            return parseInt(users[i].strategyTrading);
        }
    }
};

setNewTrade = (user_id, strategy_id) => {
    for(let i=(users.length-1); i>=0; i--){
        if(users[i].id == user_id){
            users[i].strategyTrading = strategy_id;
            let mysql_conn = mysql.createConnection(mysql_conf);
            mysql_conn.connect();
            mysql_conn.query("UPDATE user SET strategyTrading = "+strategy_id+" WHERE id = "+user_id , function (err, result) {
                if (err) throw err;
                mysql_conn.end();
            });
        }
    }
};

clearActualTrade = (user_id) => {
    for(let i=(users.length-1); i>=0; i--){
        if(users[i].id == user_id){
            users[i].strategyTrading = 0;
            let mysql_conn = mysql.createConnection(mysql_conf);
            mysql_conn.connect();
            mysql_conn.query("UPDATE user SET strategyTrading = 0 WHERE id = "+user_id , function (err, result) {
                if (err) throw err;
                mysql_conn.end();
            });
        }
    }
};

priceChanges = (channel, lastPrice) => {
    let temp = 0;
    for(var prop in pairs){
        temp=0;
        if(pairs[prop].channel == channel){
            pairs[prop].price = lastPrice;
            verifyStrategiesByPrice(prop);
        }

        if(pairs[prop].priceMoves == 0){
            pairs[prop].priceMoves = lastPrice;
            console.log(moment().format("YYYY-MM-DD H:mm:ss")+" "+prop+":"+pairs[prop].price);
        }else{
            temp = Math.abs(pairs[prop].priceMoves - pairs[prop].price);
            //console.log("Temp "+prop+":"+temp);
            temp = (temp*100)/pairs[prop].price;
            //console.log("Temp "+prop+":"+temp);
            if(temp>0.5){
                pairs[prop].priceMoves = lastPrice;
                console.log(moment().format("YYYY-MM-DD H:mm:ss")+" "+prop+":"+pairs[prop].price);
            }
        }
        //console.log(prop+":"+pairs[prop].price);
    }

};

verifyStrategiesByPrice = (pair) => {
    let userTradingStrategy = 0;
    obj = pairs[pair];
    obj.strategies.forEach(function(strat,i){
        userTradingStrategy = isUserTrading(strat.user_id);
        if(userTradingStrategy==0 && strat.buyFlag){
            //console.log("Actual price:"+obj.price+"".padEnd(20)+"Buy price:"+strat.buy+"".padEnd(20)+"Stop price:"+strat.stop+"".padEnd(20));
            if(obj.price <= strat.buy && obj.price >= strat.stop){
                //https://gist.github.com/joshuarossi/456a16bd17577a9e7681b6d43880b920
                setNewTrade(strat.user_id,strat.id);
                console.log("\033[44m"+moment().format("YYYY-MM-DD H:mm:ss")+" Usuário #"+strat.user_id+" Comprou "+pair+" por "+obj.price+"\033[00m");
            }
        }else if(userTradingStrategy == strat.id){
            if(obj.price < strat.stop){
                console.log("\033[41m"+moment().format("YYYY-MM-DD H:mm:ss")+" Usuário #"+strat.user_id+" foi stopado "+pair+" por "+obj.price+"\033[00m");
                strat.buyFlag = 0;
                clearActualTrade(strat.user_id);
                buyFlagControl(0, strat.id);
            }else if(obj.price > strat.target){
                console.log("\033[42m"+moment().format("YYYY-MM-DD H:mm:ss")+" Usuário #"+strat.user_id+" atingiu seu target "+pair+" por "+obj.price+"\033[00m");
                clearActualTrade(strat.user_id);
            }
        }else{
            if(strat.buyFlag && obj.price <= strat.stop){
                console.log("\033[41m"+moment().format("YYYY-MM-DD H:mm:ss")+" Estratégia #"+strat.id+" foi stopada "+pair+" por "+obj.price+"\033[00m");
                strat.buyFlag = 0;
                buyFlagControl(0, strat.id);
            }else if(!strat.buyFlag && obj.price >= strat.target){
                console.log("\033[42m"+moment().format("YYYY-MM-DD H:mm:ss")+" Estratégia #"+strat.id+" atingiu seu target "+pair+" por "+obj.price+"\033[00m");
                strat.buyFlag = 1;
                buyFlagControl(1, strat.id);
            }
        }

    });

};

buyFlagControl = (flag, strat_id) => {
    mysql_conn = mysql.createConnection(mysql_conf);
    mysql_conn.connect();
    mysql_conn.query("UPDATE strategy SET buyFlag = "+flag+" WHERE id = "+strat_id , function (err, result) {
        if (err) throw err;
        mysql_conn.end();
    });
};
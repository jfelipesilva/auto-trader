var database = require(__dirname + '/database');

var conf = {
    users: []
};

var users = {

    getUsers: () => {
        return conf.users;
    },

    pushUser: (user_id, strategyTrading) => {
        let flag = 0;
        for(let i=(conf.users.length-1); i>=0; i--){
            if(conf.users[i].id == user_id){
                flag = 1;
                i = -1;
            }
        }
        if(!flag){
            conf.users.push({"id":user_id,"strategyTrading":strategyTrading});
        }
        return;
    },

    getOpenTrade: (user_id) => {
        for(let i=(conf.users.length-1); i>=0; i--){
            if(conf.users[i].id == user_id){
                return parseInt(conf.users[i].strategyTrading);
            }
        }
    },

    setOpenTrade: (user_id, strategy_id, price) => {
        for(let i=(conf.users.length-1); i>=0; i--){
            if(conf.users[i].id == user_id){
                conf.users[i].strategyTrading = strategy_id;
                //UPDATE USER; UPDATE STRATEGY; INSERT ORDER;
                database.query("UPDATE user SET strategyTrading = "+strategy_id+" WHERE id = "+user_id);
                database.query("INSERT INTO orders (strategy_id, user_id, priceFilled, type) VALUES ("+strategy_id+", "+user_id+", "+price+", 'buy')");
            }
        }
    },

    updateUserStrategiesStatus: (user_id) => {
        database.query("SELECT * FROM strategies WHERE user_id = "+user_id, function(rows){
            if(rows.length > 0){
                rows.forEach(function(res, i){
                    if(res.status == 'enabled'){

                    }
                });
            }
        });
    },

    setCloseTrade: (user_id, strategy_id, price, type) => {
        for(let i=(conf.users.length-1); i>=0; i--){
            if(conf.users[i].id == user_id){
                conf.users[i].strategyTrading = 0;
                database.query("UPDATE user SET strategyTrading = 0 WHERE id = "+user_id);
                database.query("INSERT INTO orders (strategy_id, user_id, priceFilled, type) VALUES ("+strategy_id+", "+user_id+", "+price+", '"+type+"')");
            }
        }
    }

}
module.exports = users;

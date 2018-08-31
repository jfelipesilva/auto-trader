var database = require(__dirname + '/database');

var conf = {
};

var strategies = {

    buyFlagControl: (flag, strat_id) => {
        database.query("UPDATE strategy SET buyFlag = "+flag+" WHERE id = "+strat_id);
    }

}
module.exports = strategies;

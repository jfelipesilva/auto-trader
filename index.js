require('dotenv').config();
var mysql = require('mysql');
var mysql_conf = {  
  host     : process.env.BD_HOST,
  user     : process.env.BD_USER,
  password : process.env.BD_PASSWORD,
  database : process.env.BD_DATABASE
}
var mysql_conn = "";
mysql_conn = mysql.createConnection(mysql_conf);
mysql_conn.connect();
mysql_conn.query('SELECT *, CONCAT(c.slug,b.slug) pair FROM strategy a INNER JOIN currency b ON a.currency_id = b.id INNER JOIN asset c ON a.asset_id = c.id WHERE a.user_id=1 ORDER BY a.created_at', function(err, rows, fields) {
    if(rows.length > 0){
        console.log("\033[36m");
        console.log("Pair".padStart(10)+"Buy".padStart(10)+"Target".padStart(10)+"Stop".padStart(10)+"\033[00m");
        rows.forEach(function(res, i){
            pair = res.pair;
            pair = pair.toString();
            buy = res.buy;
            buy = buy.toString();
            target = res.target;
            target = target.toString();
            stop = res.stop;
            stop = stop.toString();
            console.log(pair.padStart(10)+buy.padStart(10)+target.padStart(10)+stop.padStart(10));
        });
    }
    mysql_conn.end();
});

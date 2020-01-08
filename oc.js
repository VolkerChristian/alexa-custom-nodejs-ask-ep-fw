var ClientOAuth2 = require('client-oauth2');
var util = require('util');
var mysql = require('mysql');
var request = require('request');
var ICAL = require('ical.js');

var db;

function handleDisconnect() {
    db = mysql.createConnection({
//        host: 'proliant.home.vchrist.at',
        host: '192.168.1.3',
        user: 'wastecalendar',
        password: '!!!SoMaSi01!!!'
    });

    db.connect(function onConnect(err) {
        if (err) {
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 1000);
        } else {
            console.log('MySQL Connected!');
        }
    });

    db.origQuery = db.query;

    db.query = function(sql, cb) {
        db.origQuery(sql, function(err, result) {
            if (err) {
                console.log('Query Error: ' + err);
            } else {}
            cb(err, result);
        });
    };

    db.on('error', function(error) {
        console.log('On Error: ' + error);
        if (!error.fatal) return;
        if (error.code !== 'PROTOCOL_CONNECTION_LOST' && error.code !== 'PROTOCOL_PACKETS_OUT_OF_ORDER' && error.code !== 'ECONNREFUSED') throw error;

        console.log('> Re-connecting lost MySQL connection: ' + error.stack);

        setTimeout(handleDisconnect(), 1000);
    });
}

handleDisconnect();

var nextcloudAuth = new ClientOAuth2({
    clientId: 'wsdWZ7YHytNP94j3CSh2WFMWlQQ3Dq1Dafbf0Y8YQee3VS55kthpRIInBnAUNbR2',
    clientSecret: '9gJgwVagnH5mev3440kSt6KuCQ5SwKO82zrMucxjwICVgNk0LaHulCU1y7YKHbq7',
    accessTokenUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/api/v1/token',
    authorizationUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/authorize',
    redirectUri: 'http://calisto.home.vchrist.at:8080/auth/nextcloud/callback',
    scopes: []
});

var express = require('express');
var app = express();

app.get('/auth/nextcloud', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    var uri = nextcloudAuth.code.getUri();

    console.log(util.inspect(uri));
    res.redirect(uri);
});

function insertUser(user, cb) {
    sql = `INSERT INTO wastecalendar.oc_user(
        oc_userid,
        oc_accesstoken,
        oc_refreshtoken,
        oc_expires)
    VALUES(
        ${db.escape(user.data.user_id)},
        ${db.escape(user.accessToken)},
        ${db.escape(user.refreshToken)},
        ${db.escape(user.expires)})`;

    console.log("SQL: " + sql);
    db.query(sql, function(err, result) {
        if (err) {
            console.error(err.stack);
            result.statusCode = 500;
            result.end();
            return;
        }
        console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
        if (cb) {
            cb(user);
        }
    });
}

function refreshUser(user, cb) {
    user.refresh().then(function(updatedUser) {
        console.log('AccessToken: ' + updatedUser.accessToken);
        console.log('RefreshToken: ' + updatedUser.refreshToken);
        console.log('Expires: ' + updatedUser.expires);

        var sql = `UPDATE wastecalendar.oc_user
        SET
        oc_accesstoken = ${db.escape(updatedUser.accessToken)},
            oc_refreshtoken = ${db.escape(updatedUser.refreshToken)},
            oc_expires = ${db.escape(updatedUser.expires)}
        WHERE
        oc_userid = ${db.escape(updatedUser.data.user_id)}`;

        db.query(sql, function(err, result) {
            if (err) {
                console.error(err.stack);
                result.statusCode = 500;
                result.end();
                return;
            }
            console.log(result.affectedRows + ' record updated ' + util.inspect(result));

            if (cb) {
                cb(updatedUser);
            }
        });
    });
}

app.get('/auth/nextcloud/callback', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    nextcloudAuth.code.getToken(req.originalUrl).then(function(user) {
        console.log(user);

        var sql = `SELECT * FROM wastecalendar.oc_user WHERE oc_userid = ${db.escape(user.data.user_id)}`;

        db.query(sql, function(err, result) {
            if (err) {
                console.error(err.stack);
                result.statusCode = 500;
                result.end();
                return;
            }
            console.log(result.affectedRows + ' records found ' + util.inspect(result));

            if (result && result.length) {
                sql = `DELETE FROM wastecalendar.oc_user WHERE oc_userid = ${db.escape(user.data.user_id)}`;
                db.query(sql, function(err, result) {
                    if (err) {
                        console.error(err.stack);
                        res.statusCode = 500;
                        res.send(util.inspect(result));
                        return;
                    }
                    insertUser(user, function(user) {
                        refreshUser(user, function(updatedUser) {
                            return res.send(updatedUser.accessToken);
                        });
                    });
                });
            } else {
                insertUser(user, function(user) {
                    refreshUser(user, function(updatedUser) {
                        return res.send(updatedUser.accessToken);
                    });
                });
            }
        });
    });
});

Date.prototype.toUnixTime = function() {
    return this.getTime() / 1000 | 0;
};

Date.unixTime = function() {
    return new Date().toUnixTime();
};

function processCalendar(user, cb) {
    rec = user.sign({
        url: 'https://cloud.vchrist.at/remote.php/dav/calendars/' + user.data.user_id + '/mllabfuhr/?export' + '&expand=1' + '&start=' + Date.unixTime() + '&end=' + Date.unixTime() + 3600 * 24,
        headers: {
            Accept: 'application/calendar+json'
        }
    });

    request.get(rec, function(error, response, body) {
        var iCalData = JSON.parse(body);

        //var iCalData = ICAL.parse(body);
        //console.log('Call Response: ' + JSON.stringify(iCalData, null, 4));
        //console.log('Call Status: ' + response.statusCode);

        var comp = new ICAL.Component(iCalData);
        var vevent = comp.getFirstSubcomponent('vevent');
        var event = new ICAL.Event(vevent);
        var str = '';
        if (event.startDate) {
            str = 'Event Summary: ' + event.summary + '\n\tLocale Start: ' + event.startDate.toJSDate() + '\n\tLocale End: ' + event.endDate.toJSDate();
        } else {
            str = 'No Event';
        }

        console.log(str);
        cb(str + '\n');
    });
}

app.get('/test', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    sql = "SELECT * FROM wastecalendar.oc_user WHERE oc_userid = 'voc'";

    db.query(sql, function(err, result) {
        if (err) {
            console.error(err.stack);
            res.statusCode = 500;
            res.end();
            return;
        }

        result.forEach(function(oc_user) {
            var user = nextcloudAuth.createToken(oc_user.oc_accesstoken,
                                                 oc_user.oc_refreshtoken,
                                                 'bearer',
                                                 {
                                                    user_id: oc_user.oc_userid,
                                                    expires_in: oc_user.oc_expires.toUnixTime() - Date.unixTime() - 600
                                                 });
            if (user.expired()) {
                refreshUser(user, function(updatedUser) {
                    processCalendar(updatedUser, function(body) {
                        return res.send(body);
                    });
                });
            } else {
                processCalendar(user, function(body) {
                    return res.send(body);
                });
            }
        });
    });
});

app.listen(8080, function() {
    console.log('Nextcloud oauth2 client endpoint listening on port 8080!');
});

/*
let getQueueLength = function() {
    return Math.round(12 * Math.random());
};

// We would like to retrieve the queue length at regular intervals
// this way, we can decide when to make a quick dash over
// at the optimal time

setInterval(function() {
    let queueLength = getQueueLength();

    console.log(`The queue at the McDonald's drive-through is now ${queueLength} cars long.`);

    if (queueLength === 0) {
        console.log('Quick, grab your coat!');
    }

    if (queueLength > 8) {
        return console.log('This is beginning to look impossible!');
    }
}, 3000);
*/